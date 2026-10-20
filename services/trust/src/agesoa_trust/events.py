"""Handlers for the events routed to trust by packages/contracts/events/catalog.json.

Each handler runs inside the inbox transaction (once per event id); the app refuses to start if this mapping
and the catalog disagree.
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from agesoa_packs import DomainPack, parse_datetime
from agesoa_platform.events import isoformat, new_event
from agesoa_platform.inbox import EventHandler
from agesoa_platform.outbox import add_event
from agesoa_platform.push import consumed_events, not_handled_yet
from sqlalchemy import event as sa_event
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from agesoa_trust import SERVICE
from agesoa_trust.deadline import validation_deadline
from agesoa_trust.tables import validation_requests

log = logging.getLogger(__name__)


class OutboxFlush:
    """Publish events staged by a push handler right after its inbox transaction commits, like API requests do
    with `flush_outbox` (best effort: the outbox sweep still retries anything left behind)."""

    def __init__(self, dispatch: Callable[[], Awaitable[Any]]):
        self._dispatch = dispatch
        self._tasks: set[asyncio.Task[Any]] = set()

    def after_commit(self, session: AsyncSession) -> None:
        loop = asyncio.get_running_loop()

        def kick(_session: Any) -> None:
            loop.call_soon_threadsafe(self._start)

        sa_event.listen(session.sync_session, "after_commit", kick, once=True)

    def _start(self) -> None:
        task = asyncio.get_running_loop().create_task(self._run())
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _run(self) -> None:
        try:
            await self._dispatch()
        except Exception:
            log.exception("outbox flush after event failed; the sweep will retry")

    async def wait_idle(self) -> None:
        while self._tasks:
            await asyncio.gather(*list(self._tasks), return_exceptions=True)


async def open_validation(
    session: AsyncSession,
    event: dict[str, Any],
    packs: dict[str, DomainPack],
    flush: OutboxFlush | None = None,
) -> None:
    """A finding is ready for human validation: keep what validators need to decide (no evidence files) and its
    decision deadline (deadline.py), then announce the open validation (validation.updated)."""
    d = event["data"]
    deadline = validation_deadline(packs.get(d["domain"]), event["time"])
    opened = (
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
                deadline_at=deadline,
            )
            .on_conflict_do_nothing(index_elements=[validation_requests.c.finding_id])
            .returning(validation_requests.c.finding_id)
        )
    ).scalar_one_or_none()
    if opened is not None:
        await add_event(
            session,
            validation_updated(
                {**d, "deadline_at": deadline},
                state="awaiting_decisions",
                approvals=0,
                rejections=0,
                evidence_requests=0,
                at=event["time"],
            ),
        )
        if flush is not None:
            flush.after_commit(session)
    log.info("validation opened", extra={"event_id": event["id"], "detail": {"finding_id": d["finding_id"]}})


def validation_updated(
    row: Any, *, state: str, approvals: int, rejections: int, evidence_requests: int, at: Any
) -> dict[str, Any]:
    """Progress of an open validation for the public side: counts and state only, never a validator reference."""
    deadline = row["deadline_at"]
    return new_event(
        "validation.updated",
        source=SERVICE,
        subject=row["case_id"],
        data={
            "finding_id": row["finding_id"],
            "case_id": row["case_id"],
            "state": state,
            "approvals": approvals,
            "rejections": rejections,
            "evidence_requests": evidence_requests,
            "deadline_at": isoformat(deadline) if deadline else None,
            "updated_at": isoformat(parse_datetime(at)),
            "synthetic": bool(row["synthetic"]),
        },
    )


def build_handlers(packs: dict[str, DomainPack], flush: OutboxFlush | None = None) -> dict[str, EventHandler]:
    async def on_finding_ready(session: AsyncSession, event: dict[str, Any]) -> None:
        await open_validation(session, event, packs, flush)

    handlers: dict[str, EventHandler] = {
        event_type: not_handled_yet for event_type in consumed_events(SERVICE)
    }
    handlers["finding.ready_for_validation"] = on_finding_ready
    return handlers
