"""Public HTTP API of trust (exported to openapi.json)."""

import hashlib
from datetime import datetime
from typing import Annotated, Any, Literal

from agesoa_platform.app import flush_outbox
from agesoa_platform.auth import Principal, require_role
from agesoa_platform.events import isoformat, new_event, utc_now
from agesoa_platform.outbox import add_event
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from agesoa_trust import SERVICE
from agesoa_trust.quorum import Vote, evaluate
from agesoa_trust.tables import organizations, validation_decisions, validation_requests, validators

router = APIRouter(prefix="/v1", tags=["validation"])
Validator = Annotated[Principal, Depends(require_role("validator"))]
NOT_FOUND = {404: {"description": "No such finding"}}


class QuorumStatus(BaseModel):
    outcome: Literal["approved", "rejected", "pending"]
    reason: str
    approvals: int
    rejections: int


class ValidationRequest(BaseModel):
    finding_id: str
    case_id: str
    domain: str
    statement: str
    status_label: Literal["alleged", "supported", "proven"]
    required_roles: list[str]
    evidence_refs: list[str]
    outcome: Literal["approved", "rejected"] | None
    synthetic: bool
    received_at: datetime
    completed_at: datetime | None = None


class ValidationDetail(ValidationRequest):
    quorum: QuorumStatus
    my_decision: Literal["approve", "reject"] | None


class DecisionIn(BaseModel):
    decision: Literal["approve", "reject"]
    note: str = Field("", max_length=4000)
    confidence: float | None = Field(None, ge=0, le=1)
    conflict: bool = Field(
        False, description="Declared conflict of interest: the decision is recorded but not counted."
    )


class DecisionOut(BaseModel):
    finding_id: str
    decision: Literal["approve", "reject"]
    counted: bool
    quorum_reached: bool
    outcome: Literal["approved", "rejected"] | None
    quorum: QuorumStatus


def _request_fields(row: Any) -> dict[str, Any]:
    return {k: row[k] for k in ValidationRequest.model_fields if k in row}


class ValidatorProfile(BaseModel):
    validator_id: str
    role: str
    role_label: str
    tier: Literal["high", "medium"] | None
    status: str
    organization: str | None
    region: dict[str, Any] | None
    synthetic: bool


@router.get(
    "/validators/me",
    tags=["validators"],
    summary="The signed-in validator's own profile (role label, tier, status; no personal data)",
    responses={403: {"description": "Not a registered validator"}},
)
async def my_profile(request: Request, validator: Validator) -> ValidatorProfile:
    async with request.app.state.db.sessions() as session:
        row = (
            (
                await session.execute(
                    select(validators, organizations.c.name.label("organization_name"))
                    .select_from(
                        validators.outerjoin(
                            organizations, validators.c.organization_id == organizations.c.id
                        )
                    )
                    .where(validators.c.auth_uid == validator.uid)
                )
            )
            .mappings()
            .one_or_none()
        )
    if row is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not a registered validator")
    return ValidatorProfile(
        validator_id=row["id"],
        role=row["role"],
        role_label=_any_role_label(request, row["role"]),
        tier=row["tier"],
        status=row["status"],
        organization=row["organization_name"],
        region=row["region"],
        synthetic=row["synthetic"],
    )


@router.get("/validation-requests", summary="Findings waiting for validation")
async def list_requests(request: Request, validator: Validator) -> list[ValidationRequest]:
    query = (
        select(validation_requests)
        .where(validation_requests.c.outcome.is_(None))
        .order_by(validation_requests.c.received_at)
    )
    async with request.app.state.db.sessions() as session:
        rows = (await session.execute(query)).mappings().all()
    return [ValidationRequest(**_request_fields(row)) for row in rows]


@router.get(
    "/validation-requests/{finding_id}",
    summary="One finding with its quorum status",
    responses=NOT_FOUND,
)
async def get_request(finding_id: str, request: Request, validator: Validator) -> ValidationDetail:
    async with request.app.state.db.sessions() as session:
        row = await _load_request(session, finding_id)
        votes, mine = await _votes(session, finding_id, validator.uid)
    return ValidationDetail(**_request_fields(row), quorum=_status(votes), my_decision=mine)


@router.post(
    "/validation-requests/{finding_id}/decisions",
    status_code=201,
    summary="Approve or reject a finding; quorum is evaluated by code",
    responses={
        **NOT_FOUND,
        403: {"description": "Not an active validator"},
        409: {"description": "Already decided, validation closed, or conflict of interest"},
    },
)
async def decide(
    finding_id: str, body: DecisionIn, request: Request, validator: Validator, background: BackgroundTasks
) -> DecisionOut:
    now = utc_now()
    try:
        async with request.app.state.db.transaction() as session:
            row = await _load_request(session, finding_id, lock=True)
            if row["outcome"] is not None:
                raise HTTPException(status.HTTP_409_CONFLICT, f"validation already {row['outcome']}")
            me = await _validator(session, validator.uid)
            if me["organization_name"] and me["organization_name"] in row["parties_mentioned"]:
                # The audited party never validates its own case (conflict rule, not a choice).
                raise HTTPException(status.HTTP_409_CONFLICT, "your organization is named in this finding")
            await session.execute(
                validation_decisions.insert().values(
                    finding_id=finding_id,
                    validator_id=me["id"],
                    decision=body.decision,
                    note=body.note,
                    confidence=body.confidence,
                    conflict=body.conflict,
                    decided_at=now,
                )
            )
            votes, _ = await _votes(session, finding_id, validator.uid)
            result = evaluate(votes)
            vote = next(v for v in votes if v.validator_id == me["id"])
            await add_event(session, _vote_decision(request, row, me, body, vote.counted, now))
            outcome = None if result.outcome == "pending" else result.outcome
            if outcome:
                await session.execute(
                    update(validation_requests)
                    .where(validation_requests.c.finding_id == finding_id)
                    .values(outcome=outcome, completed_at=now)
                )
                decisions = await _decision_rows(session, finding_id)
                await add_event(session, _completed(row, outcome, decisions, now))
                await add_event(session, _quorum_decision(row, outcome, result.reason, now))
    except IntegrityError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "you already decided on this finding") from exc
    background.add_task(flush_outbox, request)
    return DecisionOut(
        finding_id=finding_id,
        decision=body.decision,
        counted=vote.counted,
        quorum_reached=outcome is not None,
        outcome=outcome,
        quorum=_status(votes),
    )


# --- helpers --------------------------------------------------------------------------------------------


async def _load_request(session: AsyncSession, finding_id: str, lock: bool = False) -> Any:
    query = select(validation_requests).where(validation_requests.c.finding_id == finding_id)
    if lock:
        query = query.with_for_update()
    row = (await session.execute(query)).mappings().one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "finding not found")
    return row


async def _validator(session: AsyncSession, uid: str) -> Any:
    row = (
        (
            await session.execute(
                select(validators, organizations.c.name.label("organization_name"))
                .select_from(
                    validators.outerjoin(organizations, validators.c.organization_id == organizations.c.id)
                )
                .where(validators.c.auth_uid == uid)
            )
        )
        .mappings()
        .one_or_none()
    )
    if row is None or row["status"] not in ("active", "probation") or row["tier"] is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not an active validator")
    return row


async def _votes(session: AsyncSession, finding_id: str, uid: str) -> tuple[list[Vote], str | None]:
    rows = (
        await session.execute(
            select(
                validation_decisions.c.validator_id,
                validation_decisions.c.decision,
                validation_decisions.c.conflict,
                validators.c.organization_id,
                validators.c.tier,
                validators.c.status,
                validators.c.auth_uid,
            )
            .select_from(
                validation_decisions.join(validators, validation_decisions.c.validator_id == validators.c.id)
            )
            .where(validation_decisions.c.finding_id == finding_id)
        )
    ).all()
    votes = [Vote(r.validator_id, r.organization_id, r.tier, r.status, r.decision, r.conflict) for r in rows]
    mine = next((r.decision for r in rows if r.auth_uid == uid), None)
    return votes, mine


def _status(votes: list[Vote]) -> QuorumStatus:
    result = evaluate(votes)
    counted = [v for v in votes if v.counted]
    return QuorumStatus(
        outcome=result.outcome,
        reason=result.reason,
        approvals=sum(v.decision == "approve" for v in counted),
        rejections=sum(v.decision == "reject" for v in counted),
    )


async def _decision_rows(session: AsyncSession, finding_id: str) -> list[dict[str, Any]]:
    rows = (
        await session.execute(
            select(
                validation_decisions.c.validator_id,
                validation_decisions.c.decision,
                validation_decisions.c.note,
                validation_decisions.c.conflict,
                validators.c.organization_id,
                validators.c.tier,
            )
            .select_from(
                validation_decisions.join(validators, validation_decisions.c.validator_id == validators.c.id)
            )
            .where(validation_decisions.c.finding_id == finding_id)
            .order_by(validation_decisions.c.decided_at)
        )
    ).all()
    return [
        {
            "validator_ref": r.validator_id,
            "organization_ref": r.organization_id,
            "tier": r.tier,
            "decision": r.decision,
            "note": r.note or "",
        }
        for r in rows
        if not r.conflict
    ]


def _decision_id(*parts: str) -> str:
    return "VAL-" + hashlib.sha256("|".join(parts).encode()).hexdigest()[:24]


def _role_label(request: Request, domain: str, role: str) -> str:
    pack = getattr(request.app.state, "packs", {}).get(domain)
    labels = {r["id"]: r["label"]["en"] for r in pack.document["validator_roles"]} if pack else {}
    return labels.get(role, role)


def _any_role_label(request: Request, role: str) -> str:
    """Label of a validator role from whichever loaded domain pack defines it."""
    for pack in getattr(request.app.state, "packs", {}).values():
        for r in pack.document["validator_roles"]:
            if r["id"] == role:
                return r["label"]["en"]
    return role


PAST_TENSE = {"approve": "approved", "reject": "rejected"}


def _vote_decision(request, row, me, body: DecisionIn, counted: bool, now: datetime) -> dict[str, Any]:
    # The actor is a role label, never the validator's name.
    label = f"{_role_label(request, row['domain'], me['role'])} ({me['tier']} tier validator)"
    note = f" Note: {body.note}" if body.note else ""
    reason = (
        f"Validator {PAST_TENSE[body.decision]} the finding"
        + ("" if counted else " (declared conflict of interest: recorded, not counted)")
        + f".{note}"
    )
    decision_id = _decision_id(row["finding_id"], me["id"], body.decision)
    return new_event(
        "keputusan.dicatat",
        source=SERVICE,
        subject=decision_id,
        data={
            "decision_id": decision_id,
            "actor": {"kind": "human", "name": label, "service": SERVICE},
            "action": f"finding.{PAST_TENSE[body.decision]}",
            "subject": {"kind": "finding", "id": row["finding_id"]},
            "reason": reason[:2000],
            "evidence_refs": list(row["evidence_refs"]),
            "status_label": row["status_label"],
            "occurred_at": isoformat(now),
            "synthetic": row["synthetic"],
        },
    )


def _completed(row, outcome: str, decisions: list[dict[str, Any]], now: datetime) -> dict[str, Any]:
    return new_event(
        "validasi.selesai",
        source=SERVICE,
        subject=row["case_id"],
        data={
            "finding_id": row["finding_id"],
            "case_id": row["case_id"],
            "outcome": outcome,
            "decisions": decisions,
            "completed_at": isoformat(now),
            "synthetic": row["synthetic"],
        },
    )


def _quorum_decision(row, outcome: str, reason: str, now: datetime) -> dict[str, Any]:
    decision_id = _decision_id(row["finding_id"], "quorum", outcome)
    return new_event(
        "keputusan.dicatat",
        source=SERVICE,
        subject=decision_id,
        data={
            "decision_id": decision_id,
            "actor": {"kind": "rule", "name": "quorum", "service": SERVICE},
            "action": "finding.validated" if outcome == "approved" else "finding.returned_to_audit",
            "subject": {"kind": "finding", "id": row["finding_id"]},
            "reason": reason,
            "evidence_refs": list(row["evidence_refs"]),
            # Rejected findings go back to the audit as allegations; approved keep their evidence status.
            "status_label": row["status_label"] if outcome == "approved" else "alleged",
            "occurred_at": isoformat(now),
            "synthetic": row["synthetic"],
        },
    )
