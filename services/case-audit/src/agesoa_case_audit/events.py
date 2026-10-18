"""Handlers for the events routed to case-audit by packages/contracts/events/catalog.json.

Each handler runs inside the inbox transaction (once per event id): the case change, `case.updated` and the
decision-log entries are committed together through the outbox. The app refuses to start if this mapping and the
catalog disagree.
"""

import logging
from collections.abc import Callable
from datetime import datetime
from typing import Any

from agesoa_packs import DomainPack, parse_datetime
from agesoa_platform.events import isoformat, new_event
from agesoa_platform.inbox import EventHandler
from agesoa_platform.outbox import add_event
from agesoa_platform.push import consumed_events, not_handled_yet
from sqlalchemy import select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from agesoa_case_audit import SERVICE
from agesoa_case_audit.agent import Ranker
from agesoa_case_audit.audit import run_round
from agesoa_case_audit.cases import (
    MATCH_WINDOW,
    OPEN_STATUSES,
    OpenCase,
    Source,
    case_evidence,
    new_case_id,
    pick_case,
    regency_key,
    source_from_report,
    source_from_signal,
)
from agesoa_case_audit.decisions import decision_event
from agesoa_case_audit.patterns import IncidentStore
from agesoa_case_audit.tables import case_sources, cases

log = logging.getLogger(__name__)

SourceReader = Callable[[DomainPack, dict[str, Any]], Source]


async def attach_source(
    session: AsyncSession,
    event: dict[str, Any],
    packs: dict[str, DomainPack],
    read: SourceReader,
    store: IncidentStore,
    ranker: Ranker | None = None,
) -> None:
    """Join a report or signal to the matching open case, or open a new case; recompute the evidence deadline."""
    data = event["data"]
    pack = packs.get(data["domain"])
    if pack is None:
        # Acknowledge instead of failing: a redelivery loop cannot fix a domain this deployment does not have.
        log.warning(
            "event for an unknown domain ignored", extra={"event_id": event["id"], "domain": data["domain"]}
        )
        return
    source = read(pack, data)
    at = parse_datetime(event["time"])

    case = await _find_case(session, source)
    created = case is None
    if case is None:
        case_id = new_case_id(source)
        await session.execute(
            insert(cases).values(
                id=case_id,
                domain=source.domain,
                category=source.category,
                status="open",
                region=source.region,
                evidence_status="unknown",
                max_finding_status="proven",
                synthetic=source.synthetic,
                occurred_at=source.occurred_at,
                created_at=at,
                updated_at=at,
            )
        )
        occurred_at, synthetic, region, status = source.occurred_at, source.synthetic, source.region, "open"
    else:
        case_id = case.id
        # A case counts as synthetic only while every source in it is.
        occurred_at, synthetic = (
            min(case.occurred_at, source.occurred_at),
            case.synthetic and source.synthetic,
        )
        region, status = case.region, case.status

    await session.execute(
        insert(case_sources)
        .values(
            case_id=case_id,
            source_kind=source.kind,
            source_id=source.id,
            snapshot=source.snapshot(data),
            reporter_ref=source.reporter_ref,
        )
        .on_conflict_do_nothing()
    )
    linked = (
        await session.execute(
            select(case_sources.c.source_kind, case_sources.c.source_id, case_sources.c.snapshot)
            .where(case_sources.c.case_id == case_id)
            .order_by(case_sources.c.linked_at, case_sources.c.source_id)
        )
    ).all()
    deadlines = [parse_datetime(s["deadline_at"]) if s["deadline_at"] else None for _, _, s in linked]
    evidence = case_evidence(pack, deadlines, at)
    await session.execute(
        update(cases)
        .where(cases.c.id == case_id)
        .values(
            occurred_at=occurred_at,
            evidence_status=evidence.status,
            evidence_deadline_at=evidence.deadline_at,
            max_finding_status=evidence.max_finding_status,
            synthetic=synthetic,
            updated_at=at,
        )
    )

    await add_event(
        session,
        new_event(
            "case.updated",
            source=SERVICE,
            subject=case_id,
            data={
                "case_id": case_id,
                "domain": source.domain,
                "category": source.category,
                "status": status,
                "evidence_status": evidence.status,
                "evidence_deadline_at": isoformat(evidence.deadline_at) if evidence.deadline_at else None,
                "max_finding_status": evidence.max_finding_status,
                "region": region,
                "report_ids": [i for k, i, _ in linked if k == "report"],
                "signal_ids": [i for k, i, _ in linked if k == "signal"],
                "updated_at": isoformat(at),
                "synthetic": synthetic,
            },
        ),
    )

    refs = [e["evidence_id"] for e in data.get("evidence", [])]
    if created:
        reason = (
            f"Opened a new case: no open {source.category} case in the same regency "
            f"with an incident within {MATCH_WINDOW.days} days."
        )
        action = "case.opened"
    else:
        reason = (
            f"Added {source.kind} {source.id} to the case: same domain, category and regency, "
            f"incident within {MATCH_WINDOW.days} days of the case's first incident."
        )
        action = "case.source_added"
    await add_event(session, _decision(case_id, source, action, "case_matching", reason, refs, at))
    deadline_reason = _deadline_reason(pack, evidence)
    await add_event(
        session, _decision(case_id, source, "case.deadline_set", "evidence_deadline", deadline_reason, [], at)
    )
    await run_round(session, case_id=case_id, pack=pack, store=store, at=at, ranker=ranker)


def _deadline_reason(pack: DomainPack, evidence: Any) -> str:
    cfg = pack.evidence_deadline
    if cfg is None:
        return "This domain defines no physical-evidence deadline; evidence must be assessed by validators."
    if evidence.deadline_at is None:
        return "No incident time known, so no evidence deadline could be computed."
    when = isoformat(evidence.deadline_at)
    if evidence.status == "available":
        return f"Physical evidence presumed available until {when} ({cfg['hours']} h after the incident)."
    return (
        f"Evidence deadline {when} ({cfg['hours']} h after the incident) has passed: physical evidence "
        f"presumed lost, so findings are capped at '{evidence.max_finding_status}'."
    )


def _decision(
    case_id: str, source: Source, action: str, rule: str, reason: str, refs: list[str], at: datetime
) -> dict[str, Any]:
    return decision_event(
        case_id,
        f"{source.kind}:{source.id}",
        action=action,
        rule=rule,
        reason=reason,
        refs=refs,
        at=at,
        synthetic=source.synthetic,
    )


async def _find_case(session: AsyncSession, source: Source) -> OpenCase | None:
    key = regency_key(source.region)
    if key is None:
        return None  # an unknown regency never matches, so there is nothing to serialise on either
    # Two events for the same regency and category must not both open a case: serialise them for this transaction.
    await session.execute(
        text("select pg_advisory_xact_lock(hashtext(:key))"),
        {"key": f"{source.domain}|{source.category}|{key}"},
    )
    rows = (
        (
            await session.execute(
                select(cases).where(
                    cases.c.domain == source.domain,
                    cases.c.category == source.category,
                    cases.c.status.in_(OPEN_STATUSES),
                    cases.c.occurred_at.between(
                        source.occurred_at - MATCH_WINDOW, source.occurred_at + MATCH_WINDOW
                    ),
                )
            )
        )
        .mappings()
        .all()
    )
    return pick_case(
        [
            OpenCase(
                r["id"],
                r["domain"],
                r["category"],
                r["region"],
                r["occurred_at"],
                r["status"],
                r["synthetic"],
            )
            for r in rows
        ],
        source,
    )


def build_handlers(
    packs: dict[str, DomainPack], store: IncidentStore, ranker: Ranker | None = None
) -> dict[str, EventHandler]:
    async def on_report(session: AsyncSession, event: dict[str, Any]) -> None:
        await attach_source(session, event, packs, source_from_report, store, ranker)

    async def on_signal(session: AsyncSession, event: dict[str, Any]) -> None:
        await attach_source(session, event, packs, source_from_signal, store, ranker)

    handlers: dict[str, EventHandler] = {
        event_type: not_handled_yet for event_type in consumed_events(SERVICE)
    }
    handlers["report.received"] = on_report
    handlers["signal.received"] = on_signal
    return handlers
