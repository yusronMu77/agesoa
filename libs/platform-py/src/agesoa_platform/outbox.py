"""Transactional outbox: events are stored in the same transaction as the data change and published after commit.

`add_event` inside the unit of work; `OutboxDispatcher.dispatch()` after commit (best effort, in the request's
background) and from the sweep endpoint (Cloud Scheduler, every minute) for anything left behind.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Protocol

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from agesoa_platform.db import Database
from agesoa_platform.messaging_tables import outbox

log = logging.getLogger(__name__)


class Publisher(Protocol):
    async def publish(self, event: dict[str, Any]) -> str: ...


async def add_event(session: AsyncSession, event: dict[str, Any]) -> None:
    """Stage a validated CloudEvent (see events.new_event) in the caller's transaction."""
    await session.execute(
        insert(outbox).values(event_id=event["id"], event_type=event["type"], payload=event)
    )


class OutboxDispatcher:
    def __init__(self, db: Database, publisher: Publisher, batch_size: int = 50):
        self.db = db
        self.publisher = publisher
        self.batch_size = batch_size

    async def dispatch(self) -> dict[str, int]:
        """Publish unpublished rows in id order. Rows are locked (SKIP LOCKED) so parallel sweeps never double-send
        from the same instance set; consumers stay idempotent anyway."""
        published = failed = 0
        async with self.db.transaction() as session:
            rows = (
                await session.execute(
                    select(outbox.c.id, outbox.c.payload)
                    .where(outbox.c.published_at.is_(None))
                    .order_by(outbox.c.id)
                    .limit(self.batch_size)
                    .with_for_update(skip_locked=True)
                )
            ).all()
            for row_id, payload in rows:
                event = payload if isinstance(payload, dict) else json.loads(payload)
                try:
                    message_id = await self.publisher.publish(event)
                except Exception as exc:  # publish errors are retried by the next sweep
                    failed += 1
                    log.warning("outbox publish failed", extra={"event_id": event["id"], "error": str(exc)})
                    await session.execute(
                        update(outbox)
                        .where(outbox.c.id == row_id)
                        .values(attempts=outbox.c.attempts + 1, last_error=str(exc)[:2000])
                    )
                    continue
                published += 1
                log.info(
                    "event published",
                    extra={"event_id": event["id"], "event_type": event["type"], "message_id": message_id},
                )
                await session.execute(
                    update(outbox)
                    .where(outbox.c.id == row_id)
                    .values(published_at=func.now(), attempts=outbox.c.attempts + 1, last_error=None)
                )
        return {"published": published, "failed": failed}

    async def pending(self) -> int:
        async with self.db.sessions() as session:
            return int(
                await session.scalar(
                    select(func.count()).select_from(outbox).where(outbox.c.published_at.is_(None))
                )
                or 0
            )
