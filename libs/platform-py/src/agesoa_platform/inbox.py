"""Idempotent consumer: an event id is recorded in the inbox in the same transaction as the handler's effect,
so a redelivered event (Pub/Sub is at-least-once) has no second effect."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from agesoa_platform.db import Database
from agesoa_platform.messaging_tables import inbox

# Work a handler leaves for after its transaction has committed. It gets the database to open short transactions of its
# own; nothing may be held open across a slow call (a model, an HTTP request) or it blocks every statement that needs
# an exclusive lock, such as the demo reset.
AfterCommit = Callable[[Database], Awaitable[None]]
EventHandler = Callable[[AsyncSession, dict[str, Any]], Awaitable[AfterCommit | None]]


async def process_once(db: Database, event: dict[str, Any], handler: EventHandler) -> bool:
    """Run `handler` unless this event id was already processed. Returns False for a duplicate.

    A handler may return an `AfterCommit`: it runs once the inbox row and the handler's effect are committed and the
    event slot is free. If it fails the event stays recorded, so the work it carries must be derived data that a later
    event recomputes."""
    after: AfterCommit | None = None
    async with db.event_slots, db.transaction() as session:
        inserted = await session.scalar(
            insert(inbox)
            .values(event_id=event["id"], event_type=event["type"])
            .on_conflict_do_nothing(index_elements=[inbox.c.event_id])
            .returning(inbox.c.event_id)
        )
        if inserted is None:
            return False
        after = await handler(session, event)
    if after is not None:
        await after(db)
    return True
