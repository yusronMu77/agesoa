"""Handlers for the events routed to trust by packages/contracts/events/catalog.json.

Each handler runs inside the inbox transaction (once per event id); the app refuses to start if this mapping
and the catalog disagree.
"""

import logging
from typing import Any

from agesoa_platform.inbox import EventHandler
from agesoa_platform.push import consumed_events, not_handled_yet
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from agesoa_trust import SERVICE
from agesoa_trust.tables import validation_requests

log = logging.getLogger(__name__)


async def open_validation(session: AsyncSession, event: dict[str, Any]) -> None:
    """A finding is ready for human validation: keep what validators need to decide (no evidence files)."""
    d = event["data"]
    await session.execute(
        insert(validation_requests)
        .values(
            finding_id=d["finding_id"],
            case_id=d["case_id"],
            domain=d["domain"],
            statement=d["statement"],
            statement_i18n=d.get("statement_i18n"),
            status_label=d["status"],
            required_roles=d["required_roles"],
            parties_mentioned=d["parties_mentioned"],
            evidence_refs=d["evidence_refs"],
            region=d["region"],
            synthetic=d["synthetic"],
        )
        .on_conflict_do_nothing(index_elements=[validation_requests.c.finding_id])
    )
    log.info("validation opened", extra={"event_id": event["id"], "detail": {"finding_id": d["finding_id"]}})


HANDLERS: dict[str, EventHandler] = {event_type: not_handled_yet for event_type in consumed_events(SERVICE)}
HANDLERS["finding.ready_for_validation"] = open_validation
