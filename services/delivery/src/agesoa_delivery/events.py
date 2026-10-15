"""Handlers for the events routed to delivery by packages/contracts/events/catalog.json.

Each handler runs inside the inbox transaction (once per event id); the app refuses to start if this mapping and the
catalog disagree.
"""

from datetime import datetime
from typing import Any

from agesoa_platform.inbox import EventHandler
from agesoa_platform.push import consumed_events, not_handled_yet
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from agesoa_delivery import SERVICE
from agesoa_delivery.tables import case_validations, institutions


def _time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


async def organization_verified(session: AsyncSession, event: dict[str, Any]) -> None:
    """A verified organization (only agencies can subscribe to webhooks; newsrooms are kept for completeness)."""
    data = event["data"]
    values = {
        "name": data["name"],
        "kind": data["kind"],
        "synthetic": data["synthetic"],
        "verified_at": _time(data["verified_at"]),
    }
    if data.get("admin_ref"):
        values["admin_ref"] = data["admin_ref"]
    stmt = insert(institutions).values(organization_id=data["organization_id"], **values)
    await session.execute(stmt.on_conflict_do_update(index_elements=["organization_id"], set_=values))


def _label(decision: dict[str, Any]) -> str:
    role = decision.get("role_label") or decision.get("role") or "Validator"
    regency = decision.get("regency_name")
    return f"{role}, {regency}" if regency else role


async def validation_completed(session: AsyncSession, event: dict[str, Any]) -> None:
    """Public validation labels of a case (role + regency, never names), sent with its audit report."""
    data = event["data"]
    values = {
        "outcome": data["outcome"],
        "labels": [_label(d) for d in data["decisions"] if d["decision"] == "approve"],
        "completed_at": _time(data["completed_at"]),
    }
    stmt = insert(case_validations).values(case_id=data["case_id"], **values)
    await session.execute(stmt.on_conflict_do_update(index_elements=["case_id"], set_=values))


HANDLERS: dict[str, EventHandler] = {event_type: not_handled_yet for event_type in consumed_events(SERVICE)}
HANDLERS["organisasi.terverifikasi"] = organization_verified
HANDLERS["validasi.selesai"] = validation_completed
