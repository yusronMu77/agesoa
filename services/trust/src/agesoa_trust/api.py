"""Public HTTP API of trust (exported to openapi.json)."""

import hashlib
from datetime import datetime
from typing import Annotated, Any, Literal

from agesoa_platform.app import flush_outbox
from agesoa_platform.auth import Principal, authenticate, require_role
from agesoa_platform.events import isoformat, new_event, utc_now
from agesoa_platform.outbox import add_event
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from agesoa_trust import SERVICE
from agesoa_trust.deadline import deadline_sort_key
from agesoa_trust.events import validation_updated
from agesoa_trust.quorum import FINAL_DECISIONS, Vote, evaluate, evidence_requests, may_decide, state
from agesoa_trust.routing import routed
from agesoa_trust.tables import organizations, validation_decisions, validation_requests, validators

router = APIRouter(prefix="/v1", tags=["validation"])
Validator = Annotated[Principal, Depends(require_role("validator"))]
# Any signed-in account: a candidate sees their own registration before they hold the validator claim.
Signed = Annotated[Principal, Depends(authenticate)]
NOT_FOUND = {404: {"description": "No such finding"}}
DecisionValue = Literal["approve", "reject", "needs_evidence"]
ValidationState = Literal["awaiting_decisions", "needs_evidence"]


class QuorumStatus(BaseModel):
    outcome: Literal["approved", "rejected", "pending"]
    reason: str
    approvals: int
    rejections: int
    evidence_requests: int = Field(
        0, description="Counted validators whose current decision is needs_evidence (never counted in quorum)"
    )


class ValidationRequest(BaseModel):
    finding_id: str
    case_id: str
    domain: str
    statement: str
    statement_i18n: dict[str, str] | None = Field(
        None,
        description="The statement per portal language (id, en) when the producer wrote it; else use statement",
    )
    status_label: Literal["alleged", "supported", "proven"]
    required_roles: list[str]
    evidence_refs: list[str]
    region: dict[str, Any] | None = None
    outcome: Literal["approved", "rejected"] | None
    synthetic: bool
    received_at: datetime
    completed_at: datetime | None = None
    deadline_at: datetime | None = Field(
        None,
        description="Decision deadline (Tenggat): ready time + the domain pack's validation.decision_window_hours; "
        "null when the pack sets none. The queue is sorted by it, nearest first, requests without one last.",
    )
    state: ValidationState = Field(
        "awaiting_decisions",
        description="needs_evidence while a counted validator's current decision asks for more evidence "
        "(chip 'Butuh bukti'); not a verdict, see outcome",
    )
    evidence_requests: int = Field(
        0, description="Counted validators whose current decision is needs_evidence"
    )
    my_decision: DecisionValue | None = Field(
        None, description="The signed-in validator's current decision; null when they have not decided yet"
    )


class ValidationDetail(ValidationRequest):
    quorum: QuorumStatus


class DecisionIn(BaseModel):
    decision: DecisionValue = Field(
        description="approve | reject | needs_evidence (ask for more evidence before deciding: recorded and "
        "logged, never counted toward quorum; the same validator may later replace it once with approve or reject)"
    )
    note: str = Field(
        "", max_length=4000, description="Required (not blank) for needs_evidence: what is missing"
    )
    confidence: float | None = Field(None, ge=0, le=1)
    conflict: bool = Field(
        False, description="Declared conflict of interest: the decision is recorded but not counted."
    )

    @model_validator(mode="after")
    def _evidence_request_says_what_is_missing(self) -> "DecisionIn":
        if self.decision == "needs_evidence" and not self.note.strip():
            raise ValueError("a needs_evidence decision needs a note saying which evidence is missing")
        return self


class DecisionOut(BaseModel):
    finding_id: str
    decision: DecisionValue
    counted: bool
    replaced: bool = Field(False, description="True when this decision replaced your earlier needs_evidence")
    quorum_reached: bool
    outcome: Literal["approved", "rejected"] | None
    state: ValidationState | None = Field(
        None, description="State of the still open validation; null once closed"
    )
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
    path: str | None = None
    probation: bool = Field(False, description="New validator: counted in quorum, labelled as new (TC-123)")
    confidence: float | None = None
    rejection_reason: str | None = None


@router.get(
    "/validators/me",
    tags=["validators"],
    summary="The signed-in validator's own profile (role label, tier, status; no personal data)",
    responses={403: {"description": "Not a registered validator"}},
)
async def my_profile(request: Request, validator: Signed) -> ValidatorProfile:
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
        path=row["path"],
        probation=row["status"] == "probation",
        confidence=row["confidence"],
        rejection_reason=row["rejection_reason"],
    )


@router.get(
    "/validation-requests",
    summary="Findings waiting for validation that are routed to me (role, regency, no conflict), nearest "
    "deadline first",
    responses={403: {"description": "Not an active validator"}},
)
async def list_requests(request: Request, validator: Validator) -> list[ValidationRequest]:
    query = select(validation_requests).where(validation_requests.c.outcome.is_(None))
    async with request.app.state.db.sessions() as session:
        me = await _validator(session, validator.uid)
        rows = sorted(
            (row for row in (await session.execute(query)).mappings().all() if routed(me, row)),
            key=deadline_sort_key,
        )
        votes = await _votes_by_finding(session, [row["finding_id"] for row in rows])
    return [
        ValidationRequest(
            **_request_fields(row), **_progress(*votes.get(row["finding_id"], ([], {})), me["id"])
        )
        for row in rows
    ]


@router.get(
    "/validation-requests/{finding_id}",
    summary="One finding with its quorum status",
    responses=NOT_FOUND,
)
async def get_request(finding_id: str, request: Request, validator: Validator) -> ValidationDetail:
    async with request.app.state.db.sessions() as session:
        row = await _load_request(session, finding_id)
        votes, mine = await _votes(session, finding_id, validator.uid)
    return ValidationDetail(
        **_request_fields(row),
        state=state(votes),
        evidence_requests=evidence_requests(votes),
        my_decision=mine,
        quorum=_status(votes),
    )


@router.post(
    "/validation-requests/{finding_id}/decisions",
    status_code=201,
    summary="Approve, reject or ask for more evidence (needs_evidence); quorum is evaluated by code",
    responses={
        **NOT_FOUND,
        403: {"description": "Not an active validator"},
        409: {
            "description": "Already decided (approve/reject are final; needs_evidence may be replaced once by "
            "approve or reject), validation closed, or conflict of interest"
        },
        422: {"description": "Invalid body, e.g. needs_evidence without a note"},
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
            previous = await session.scalar(
                select(validation_decisions.c.decision).where(
                    validation_decisions.c.finding_id == finding_id,
                    validation_decisions.c.validator_id == me["id"],
                )
            )
            if not may_decide(previous, body.decision):
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    "you already asked for more evidence on this finding; approve or reject it"
                    if previous == body.decision == "needs_evidence"
                    else "you already decided on this finding",
                )
            values = {
                "decision": body.decision,
                "note": body.note,
                "confidence": body.confidence,
                "conflict": body.conflict,
                "decided_at": now,
            }
            if previous is None:
                await session.execute(
                    validation_decisions.insert().values(
                        finding_id=finding_id, validator_id=me["id"], **values
                    )
                )
            else:  # approve/reject replaces the validator's own needs_evidence; the log keeps both entries
                await session.execute(
                    update(validation_decisions)
                    .where(
                        validation_decisions.c.finding_id == finding_id,
                        validation_decisions.c.validator_id == me["id"],
                    )
                    .values(values)
                )
            replaced = previous is not None
            votes, _ = await _votes(session, finding_id, validator.uid)
            result = evaluate(votes)
            vote = next(v for v in votes if v.validator_id == me["id"])
            await add_event(session, _vote_decision(request, row, me, body, vote.counted, replaced, now))
            outcome = None if result.outcome == "pending" else result.outcome
            if outcome is None:
                await add_event(session, _progress_event(row, votes, now))
            if outcome:
                await session.execute(
                    update(validation_requests)
                    .where(validation_requests.c.finding_id == finding_id)
                    .values(outcome=outcome, completed_at=now)
                )
                decisions = await _decision_rows(request, session, row)
                await add_event(session, _completed(row, outcome, decisions, now))
                await add_event(session, _quorum_decision(row, outcome, result.reason, now))
    except IntegrityError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "you already decided on this finding") from exc
    background.add_task(flush_outbox, request)
    return DecisionOut(
        finding_id=finding_id,
        decision=body.decision,
        counted=vote.counted,
        replaced=replaced,
        quorum_reached=outcome is not None,
        outcome=outcome,
        state=None if outcome else state(votes),
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


def _vote_query() -> Any:
    return select(
        validation_decisions.c.finding_id,
        validation_decisions.c.validator_id,
        validation_decisions.c.decision,
        validation_decisions.c.conflict,
        validators.c.organization_id,
        validators.c.tier,
        validators.c.status,
        validators.c.auth_uid,
    ).select_from(
        validation_decisions.join(validators, validation_decisions.c.validator_id == validators.c.id)
    )


def _vote(r: Any) -> Vote:
    return Vote(r.validator_id, r.organization_id, r.tier, r.status, r.decision, r.conflict)


async def _votes(session: AsyncSession, finding_id: str, uid: str) -> tuple[list[Vote], str | None]:
    rows = (await session.execute(_vote_query().where(validation_decisions.c.finding_id == finding_id))).all()
    mine = next((r.decision for r in rows if r.auth_uid == uid), None)
    return [_vote(r) for r in rows], mine


async def _votes_by_finding(
    session: AsyncSession, finding_ids: list[str]
) -> dict[str, tuple[list[Vote], dict[str, str]]]:
    """Votes per finding plus each validator's current decision (validator id -> decision), in one query."""
    result: dict[str, tuple[list[Vote], dict[str, str]]] = {}
    if not finding_ids:
        return result
    rows = (
        await session.execute(_vote_query().where(validation_decisions.c.finding_id.in_(finding_ids)))
    ).all()
    for r in rows:
        votes, decisions = result.setdefault(r.finding_id, ([], {}))
        votes.append(_vote(r))
        decisions[r.validator_id] = r.decision
    return result


def _progress(votes: list[Vote], decisions: dict[str, str], validator_id: str) -> dict[str, Any]:
    return {
        "state": state(votes),
        "evidence_requests": evidence_requests(votes),
        "my_decision": decisions.get(validator_id),
    }


def _status(votes: list[Vote]) -> QuorumStatus:
    result = evaluate(votes)
    counted = [v for v in votes if v.counted]
    return QuorumStatus(
        outcome=result.outcome,
        reason=result.reason,
        approvals=sum(v.decision == "approve" for v in counted),
        rejections=sum(v.decision == "reject" for v in counted),
        evidence_requests=evidence_requests(votes),
    )


def _progress_event(row: Any, votes: list[Vote], now: datetime) -> dict[str, Any]:
    quorum = _status(votes)
    return validation_updated(
        row,
        state=state(votes),
        approvals=quorum.approvals,
        rejections=quorum.rejections,
        evidence_requests=quorum.evidence_requests,
        at=now,
    )


async def _decision_rows(request: Request, session: AsyncSession, row: Any) -> list[dict[str, Any]]:
    """Counted decisions for validation.completed: references + tier, and the role label and regency that the
    public dashboard shows ("<role label>, <regency>"); never a name. Only approve/reject: an outstanding
    needs_evidence never counted toward the outcome."""
    rows = (
        await session.execute(
            select(
                validation_decisions.c.validator_id,
                validation_decisions.c.decision,
                validation_decisions.c.note,
                validation_decisions.c.conflict,
                validators.c.organization_id,
                validators.c.tier,
                validators.c.role,
                validators.c.region,
            )
            .select_from(
                validation_decisions.join(validators, validation_decisions.c.validator_id == validators.c.id)
            )
            .where(validation_decisions.c.finding_id == row["finding_id"])
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
            "role": r.role,
            "role_label": _role_label(request, row["domain"], r.role),
            "regency_name": (r.region or {}).get("regency_name"),
        }
        for r in rows
        if not r.conflict and r.decision in FINAL_DECISIONS
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
VOTE_ACTIONS = {
    "approve": "finding.approved",
    "reject": "finding.rejected",
    "needs_evidence": "finding.evidence_requested",
}


def _vote_reason(decision: str, counted: bool, replaced: bool, note: str) -> str:
    """Decision log text of one vote (public, English, no name). needs_evidence is never counted toward quorum."""
    if decision == "needs_evidence":
        text = "Validator asked for more evidence before deciding (not counted toward quorum"
        text += "; declared conflict of interest)" if not counted else ")"
    else:
        text = f"Validator {PAST_TENSE[decision]} the finding"
        if replaced:
            text += ", replacing their request for more evidence"
        if not counted:
            text += " (declared conflict of interest: recorded, not counted)"
    return text + "." + (f" Note: {note}" if note else "")


def _vote_decision(
    request, row, me, body: DecisionIn, counted: bool, replaced: bool, now: datetime
) -> dict[str, Any]:
    # The actor is a role label, never the validator's name.
    label = f"{_role_label(request, row['domain'], me['role'])} ({me['tier']} tier validator)"
    reason = _vote_reason(body.decision, counted, replaced, body.note)
    decision_id = _decision_id(row["finding_id"], me["id"], body.decision)
    return new_event(
        "decision.recorded",
        source=SERVICE,
        subject=decision_id,
        data={
            "decision_id": decision_id,
            "actor": {"kind": "human", "name": label, "service": SERVICE},
            "action": VOTE_ACTIONS[body.decision],
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
        "validation.completed",
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
        "decision.recorded",
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
