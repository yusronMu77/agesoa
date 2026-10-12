"""Handlers for the events routed to transparency by packages/contracts/events/catalog.json.

Each handler runs inside the inbox transaction (once per event id). Replace `not_handled_yet` with a real
handler as features land; the app refuses to start if this mapping and the catalog disagree.
"""

import logging
from typing import Any

from agesoa_platform.inbox import EventHandler
from agesoa_platform.push import consumed_events, not_handled_yet
from sqlalchemy.ext.asyncio import AsyncSession

from agesoa_transparency import SERVICE
from agesoa_transparency.chain import append_decision

log = logging.getLogger(__name__)


async def record_decision(session: AsyncSession, event: dict[str, Any]) -> None:
    appended = await append_decision(session, event)
    log.info(
        "decision appended",
        extra={"event_id": event["id"], "detail": {"seq": appended.seq, "hash": appended.hash}},
    )


HANDLERS: dict[str, EventHandler] = {event_type: not_handled_yet for event_type in consumed_events(SERVICE)}
HANDLERS["keputusan.dicatat"] = record_decision
