"""Handlers for the events routed to transparency by packages/contracts/events/catalog.json.

Each handler runs inside the inbox transaction (once per event id); the app refuses to start if this mapping
and the catalog disagree. `keputusan.dicatat` extends the hash-chained log; every other consumed event is kept
as source for the public read model (see read_model.py).
"""

import logging
from typing import Any

from agesoa_platform.inbox import EventHandler
from agesoa_platform.push import consumed_events
from sqlalchemy.ext.asyncio import AsyncSession

from agesoa_transparency import SERVICE
from agesoa_transparency.chain import append_decision
from agesoa_transparency.read_model import SOURCES, project_after_commit, store_event

log = logging.getLogger(__name__)


async def record_decision(session: AsyncSession, event: dict[str, Any]) -> None:
    appended = await append_decision(session, event)
    log.info(
        "decision appended",
        extra={"event_id": event["id"], "detail": {"seq": appended.seq, "hash": appended.hash}},
    )
    project_after_commit(session)


HANDLERS: dict[str, EventHandler] = {
    event_type: store_event for event_type in consumed_events(SERVICE) if event_type in SOURCES
}
HANDLERS["keputusan.dicatat"] = record_decision
