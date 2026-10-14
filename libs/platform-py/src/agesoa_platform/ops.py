"""Operator view of a service's event traffic (SCR-090 "Machine" tab): counts and recent event types from the
service's own outbox and inbox. Read-only, role `operator`, and never the payload: no case content leaves here."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import func, literal, select, union_all

from agesoa_platform.auth import Principal, require_role
from agesoa_platform.messaging_tables import inbox, outbox

RECENT = 15
Operator = Annotated[Principal, Depends(require_role("operator"))]


class EventTypeCount(BaseModel):
    direction: Literal["out", "in"]
    event_type: str
    count: int
    last_at: datetime | None


class RecentEvent(BaseModel):
    direction: Literal["out", "in"]
    event_type: str
    at: datetime
    status: Literal["published", "pending", "failing", "processed"]


class OpsEvents(BaseModel):
    service: str
    outbox_pending: int
    outbox_published: int
    outbox_failing: int
    inbox_processed: int
    by_type: list[EventTypeCount]
    recent: list[RecentEvent]


async def event_stats(db, service: str) -> OpsEvents:
    async with db.sessions() as session:
        totals = (
            await session.execute(
                select(
                    func.count().filter(outbox.c.published_at.is_(None)),
                    func.count().filter(outbox.c.published_at.is_not(None)),
                    func.count().filter(outbox.c.published_at.is_(None), outbox.c.last_error.is_not(None)),
                )
            )
        ).one()
        received = await session.scalar(select(func.count()).select_from(inbox))
        out_types = await session.execute(
            select(outbox.c.event_type, func.count(), func.max(outbox.c.created_at)).group_by(
                outbox.c.event_type
            )
        )
        in_types = await session.execute(
            select(inbox.c.event_type, func.count(), func.max(inbox.c.received_at)).group_by(
                inbox.c.event_type
            )
        )
        recent = union_all(
            select(
                literal("out").label("direction"),
                outbox.c.event_type,
                outbox.c.created_at.label("at"),
                outbox.c.published_at.is_not(None).label("done"),
                outbox.c.last_error.is_not(None).label("failing"),
            ),
            select(
                literal("in").label("direction"),
                inbox.c.event_type,
                inbox.c.received_at.label("at"),
                literal(True).label("done"),
                literal(False).label("failing"),
            ),
        ).subquery()
        rows = (await session.execute(select(recent).order_by(recent.c.at.desc()).limit(RECENT))).all()

    def status(r) -> str:
        if r.direction == "in":
            return "processed"
        return "published" if r.done else ("failing" if r.failing else "pending")

    by_type = [
        EventTypeCount(direction="out", event_type=t, count=n, last_at=at) for t, n, at in out_types
    ] + [EventTypeCount(direction="in", event_type=t, count=n, last_at=at) for t, n, at in in_types]
    return OpsEvents(
        service=service,
        outbox_pending=totals[0],
        outbox_published=totals[1],
        outbox_failing=totals[2],
        inbox_processed=received or 0,
        by_type=sorted(by_type, key=lambda e: (e.direction, e.event_type)),
        recent=[
            RecentEvent(direction=r.direction, event_type=r.event_type, at=r.at, status=status(r))
            for r in rows
        ],
    )


def ops_router(service: str) -> APIRouter:
    router = APIRouter(prefix="/v1/ops", tags=["ops"])

    @router.get("/events", summary="Event traffic of this service (operator; counts and types, no payloads)")
    async def events(request: Request, _: Operator) -> OpsEvents:
        return await event_stats(request.app.state.db, service)

    return router
