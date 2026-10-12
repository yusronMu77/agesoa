"""Idempotent consumer: an event id is recorded in the inbox in the same transaction as the handler's effect,
so a redelivered event (Pub/Sub is at-least-once) has no second effect."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from agesoa_platform.db import Database
from agesoa_platform.messaging_tables import inbox

EventHandler = Callable[[AsyncSession, dict[str, Any]], Awaitable[None]]


async def process_once(db: Database, event: dict[str, Any], handler: EventHandler) -> bool:
    """Run `handler` unless this event id was already processed. Returns False for a duplicate."""
    async with db.transaction() as session:
        inserted = await session.scalar(
            insert(inbox)
            .values(event_id=event["id"], event_type=event["type"])
            .on_conflict_do_nothing(index_elements=[inbox.c.event_id])
            .returning(inbox.c.event_id)
        )
        if inserted is None:
            return False
        await handler(session, event)
        return True
