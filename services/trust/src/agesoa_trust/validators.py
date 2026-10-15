"""Validator registration (P1a, SCR-021) and staff confirmation by a verified newsroom (SCR-061).

A signed-in person uploads one role document; Agen Peran reads it (fields + confidence), `registration.decide`
decides, and the outcome goes to the public decision log as a rule decision (no name, no document). The document
image is never stored. Accepted validators get the `validator` role claim (Identity Platform; the emulator locally).
"""

from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import date, datetime
from typing import Annotated, Any, Literal

from agesoa_platform.app import flush_outbox
from agesoa_platform.auth import Principal, authenticate, require_role
from agesoa_platform.events import isoformat, new_event, utc_now
from agesoa_platform.outbox import add_event
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from pydantic import BaseModel
from sqlalchemy import select, update

from agesoa_trust import SERVICE
from agesoa_trust.registration import Organization, Outcome, Reading, after_confirmation, decide
from agesoa_trust.role_agent import RoleDocument
from agesoa_trust.tables import organizations, staff_confirmations, validators

router = APIRouter(prefix="/v1", tags=["validators"])
Signed = Annotated[Principal, Depends(authenticate)]
OrgAdmin = Annotated[Principal, Depends(require_role("org_admin"))]
MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
DOCUMENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
log = logging.getLogger(__name__)


class DocumentReading(BaseModel):
    document_type: str
    name: str | None
    position: str | None
    issuer: str | None
    number: str | None
    valid_until: date | None
    confidence: float
    anomalies: list[str]


class RegistrationOut(BaseModel):
    validator_id: str
    status: Literal["awaiting_confirmation", "probation", "rejected"]
    path: Literal["self_declared", "org_confirmed"]
    tier: Literal["high", "medium"] | None
    reason: str | None
    reading: DocumentReading


class StaffCandidate(BaseModel):
    validator_id: str
    role: str
    role_label: str
    name: str | None
    position: str | None
    document_type: str | None
    confidence: float | None
    requested_at: datetime


class StaffDecisionIn(BaseModel):
    decision: Literal["confirm", "reject"]


class StaffDecisionOut(BaseModel):
    validator_id: str
    status: str
    tier: str | None


def _role_ids(request: Request) -> dict[str, str]:
    roles: dict[str, str] = {}
    for pack in getattr(request.app.state, "packs", {}).values():
        for r in pack.document["validator_roles"]:
            roles.setdefault(r["id"], r["label"]["en"])
    return roles


class RoleOption(BaseModel):
    id: str
    label: str


class NewsroomOption(BaseModel):
    organization_id: str
    name: str
    regency_name: str | None


@router.get(
    "/validators/roles", summary="Validator roles a candidate can register for (from the domain packs)"
)
async def roles(request: Request) -> list[RoleOption]:
    return [RoleOption(id=k, label=v) for k, v in _role_ids(request).items()]


@router.get(
    "/organizations/newsrooms",
    tags=["organizations"],
    summary="Verified newsrooms a candidate can name (they confirm their staff)",
)
async def newsrooms(request: Request) -> list[NewsroomOption]:
    query = (
        select(organizations)
        .where(organizations.c.kind == "newsroom", organizations.c.status == "verified")
        .order_by(organizations.c.name)
    )
    async with request.app.state.db.sessions() as session:
        rows = (await session.execute(query)).mappings().all()
    return [
        NewsroomOption(
            organization_id=r["id"], name=r["name"], regency_name=(r["region"] or {}).get("regency_name")
        )
        for r in rows
    ]


@router.post(
    "/validators/registrations",
    status_code=201,
    summary="Register as a validator with one role document (read by Agen Peran, never stored)",
    responses={
        409: {"description": "Already registered (and not rejected)"},
        413: {"description": "Document larger than 10 MB"},
        415: {"description": "Not a JPEG, PNG or WebP image"},
        422: {"description": "Unknown role or organization"},
    },
)
async def register(
    request: Request,
    principal: Signed,
    background: BackgroundTasks,
    role: Annotated[str, Form(description="Validator role id from a domain pack")],
    field: Annotated[str, Form(min_length=2, max_length=120)],
    regency_name: Annotated[str, Form(min_length=2, max_length=120)],
    document: Annotated[UploadFile, File(description="Press card, assignment letter or certificate (image)")],
    organization_id: Annotated[str | None, Form()] = None,
) -> RegistrationOut:
    if principal.claims.get("firebase", {}).get("sign_in_provider") == "anonymous":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "sign in with an account to register")
    roles = _role_ids(request)
    if role not in roles:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"unknown role {role!r}")
    data = await document.read(MAX_DOCUMENT_BYTES + 1)
    if len(data) > MAX_DOCUMENT_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "document larger than 10 MB")
    media_type = _image_type(data)
    if media_type is None:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "document must be a JPEG, PNG or WebP image"
        )

    async with request.app.state.db.sessions() as session:
        existing = (
            (await session.execute(select(validators).where(validators.c.auth_uid == principal.uid)))
            .mappings()
            .one_or_none()
        )
        org_row = None
        if organization_id:
            org_row = (
                (await session.execute(select(organizations).where(organizations.c.id == organization_id)))
                .mappings()
                .one_or_none()
            )
            if org_row is None:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "unknown organization")
    if existing is not None and existing["status"] != "rejected":
        raise HTTPException(status.HTTP_409_CONFLICT, f"already registered ({existing['status']})")

    reading = await request.app.state.role_agent.read(data, media_type)
    del data  # the image is not kept anywhere
    settings = request.app.state.settings
    org = Organization(org_row["name"], org_row["kind"], org_row["status"]) if org_row else None
    outcome = decide(
        Reading(reading.document_type, reading.issuer, reading.valid_until, reading.confidence),
        org,
        settings.role_confidence_threshold,
        utc_now().date(),
    )
    now = utc_now()
    validator_id = existing["id"] if existing else "VAL-" + secrets.token_hex(6).upper()
    region = {
        "regency_code": None,
        "regency_name": regency_name.strip(),
        "district_code": None,
        "district_name": None,
    }
    values = {
        "auth_uid": principal.uid,
        "role": role,
        "field": field.strip(),
        "region": region,
        "organization_id": org_row["id"] if org_row and outcome.path == "org_confirmed" else None,
        "path": outcome.path,
        "tier": outcome.tier,
        "status": outcome.status,
        "extracted": reading.extracted(),
        "confidence": reading.confidence,
        "valid_until": datetime.combine(reading.valid_until, datetime.min.time(), now.tzinfo)
        if reading.valid_until
        else None,
        "synthetic": settings.demo_mode,
        "rejection_reason": outcome.reason,
        "decided_at": None if outcome.status == "awaiting_confirmation" else now,
    }
    async with request.app.state.db.transaction() as session:
        if existing:
            await session.execute(update(validators).where(validators.c.id == validator_id).values(values))
        else:
            await session.execute(validators.insert().values(id=validator_id, **values))
        if outcome.status == "awaiting_confirmation":
            await session.execute(
                staff_confirmations.insert().values(
                    validator_id=validator_id, organization_id=org_row["id"], status="pending"
                )
            )
        await add_event(
            session, _registration_decision(validator_id, roles[role], outcome, reading, settings, now)
        )
        if outcome.status == "probation":
            await add_event(session, _activated(validator_id, values, now))
    background.add_task(flush_outbox, request)
    if outcome.status == "probation":
        background.add_task(_grant_validator_claim, request, principal.uid)
    log.info("validator registration", extra={"detail": {"status": outcome.status, "reason": outcome.reason}})
    return RegistrationOut(
        validator_id=validator_id,
        status=outcome.status,
        path=outcome.path,
        tier=outcome.tier,
        reason=outcome.reason,
        reading=DocumentReading(**{k: getattr(reading, k) for k in DocumentReading.model_fields}),
    )


@router.get(
    "/organizations/{organization_id}/staff",
    tags=["organizations"],
    summary="Candidates waiting for this newsroom to confirm them as staff (name + position read, no image)",
    responses={404: {"description": "No such organization of yours"}},
)
async def pending_staff(organization_id: str, request: Request, admin: OrgAdmin) -> list[StaffCandidate]:
    roles = _role_ids(request)
    async with request.app.state.db.sessions() as session:
        await _my_org(session, organization_id, admin.uid)
        rows = (
            (
                await session.execute(
                    select(validators, staff_confirmations.c.created_at.label("requested_at"))
                    .select_from(
                        staff_confirmations.join(
                            validators, staff_confirmations.c.validator_id == validators.c.id
                        )
                    )
                    .where(
                        staff_confirmations.c.organization_id == organization_id,
                        staff_confirmations.c.status == "pending",
                    )
                    .order_by(staff_confirmations.c.created_at)
                )
            )
            .mappings()
            .all()
        )
    return [
        StaffCandidate(
            validator_id=r["id"],
            role=r["role"],
            role_label=roles.get(r["role"], r["role"]),
            name=(r["extracted"] or {}).get("name"),
            position=(r["extracted"] or {}).get("position"),
            document_type=(r["extracted"] or {}).get("document_type"),
            confidence=r["confidence"],
            requested_at=r["requested_at"],
        )
        for r in rows
    ]


@router.post(
    "/organizations/{organization_id}/staff/{validator_id}",
    tags=["organizations"],
    summary="Confirm (tier high) or refuse a candidate as this newsroom's staff",
    responses={404: {"description": "No such pending candidate of your organization"}},
)
async def decide_staff(
    organization_id: str,
    validator_id: str,
    body: StaffDecisionIn,
    request: Request,
    admin: OrgAdmin,
    background: BackgroundTasks,
) -> StaffDecisionOut:
    roles = _role_ids(request)
    now = utc_now()
    outcome = after_confirmation(body.decision == "confirm")
    async with request.app.state.db.transaction() as session:
        await _my_org(session, organization_id, admin.uid)
        row = (
            (
                await session.execute(
                    select(validators)
                    .select_from(
                        staff_confirmations.join(
                            validators, staff_confirmations.c.validator_id == validators.c.id
                        )
                    )
                    .where(
                        staff_confirmations.c.organization_id == organization_id,
                        staff_confirmations.c.validator_id == validator_id,
                        staff_confirmations.c.status == "pending",
                    )
                    .with_for_update()
                )
            )
            .mappings()
            .one_or_none()
        )
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "no such pending candidate")
        await session.execute(
            update(staff_confirmations)
            .where(
                staff_confirmations.c.organization_id == organization_id,
                staff_confirmations.c.validator_id == validator_id,
            )
            .values(status="confirmed" if body.decision == "confirm" else "rejected", decided_at=now)
        )
        changes = {
            "status": outcome.status,
            "tier": outcome.tier,
            "rejection_reason": outcome.reason,
            "decided_at": now,
        }
        await session.execute(update(validators).where(validators.c.id == validator_id).values(changes))
        await add_event(
            session, _staff_decision(validator_id, roles.get(row["role"], row["role"]), outcome, row, now)
        )
        if outcome.status == "probation":
            await add_event(session, _activated(validator_id, {**dict(row), **changes}, now))
    background.add_task(flush_outbox, request)
    if outcome.status == "probation":
        background.add_task(_grant_validator_claim, request, row["auth_uid"])
    return StaffDecisionOut(validator_id=validator_id, status=outcome.status, tier=outcome.tier)


# --- helpers ---------------------------------------------------------------------------------------------------


def _image_type(data: bytes) -> str | None:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


async def _my_org(session: Any, organization_id: str, uid: str) -> Any:
    row = (
        (
            await session.execute(
                select(organizations).where(
                    organizations.c.id == organization_id, organizations.c.admin_uid == uid
                )
            )
        )
        .mappings()
        .one_or_none()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "organization not found")
    if row["kind"] != "newsroom" or row["status"] != "verified":
        raise HTTPException(status.HTTP_409_CONFLICT, "only a verified newsroom confirms staff")
    return row


async def _grant_validator_claim(request: Request, uid: str) -> None:
    """Best effort: without the claim the person cannot validate yet; an operator can retry."""
    admin = getattr(request.app.state, "identity", None)
    if admin is None:
        return
    try:
        claims = await admin.claims_of(uid)
        await admin.set_roles(uid, claims | {"validator"})
    except Exception:
        log.exception("validator role claim not set", extra={"detail": {"uid_hash": _h(uid)}})


def _h(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()[:12]


def _registration_decision(
    validator_id: str, role_label: str, outcome: Outcome, reading: RoleDocument, settings: Any, now: datetime
) -> dict[str, Any]:
    action = {
        "probation": "validator.accepted",
        "awaiting_confirmation": "validator.awaiting_confirmation",
        "rejected": "validator.rejected",
    }[outcome.status]
    reason = {
        "probation": f"{role_label} document read with confidence {reading.confidence:.2f} (threshold "
        f"{settings.role_confidence_threshold:.2f}); accepted on probation, tier {outcome.tier}.",
        "awaiting_confirmation": f"{role_label} document issued by the named verified newsroom; waiting for the "
        "newsroom to confirm the candidate as staff.",
        "rejected": f"{role_label} registration rejected: {outcome.reason}.",
    }[outcome.status]
    return _decision(validator_id, action, reason, settings.demo_mode, now)


def _staff_decision(
    validator_id: str, role_label: str, outcome: Outcome, row: Any, now: datetime
) -> dict[str, Any]:
    if outcome.status == "probation":
        action, reason = (
            "validator.confirmed",
            f"{role_label} confirmed by a verified newsroom; tier high, on probation.",
        )
    else:
        action, reason = "validator.rejected", f"{role_label} not confirmed by the named newsroom."
    return _decision(validator_id, action, reason, row["synthetic"], now)


def _decision(validator_id: str, action: str, reason: str, synthetic: bool, now: datetime) -> dict[str, Any]:
    decision_id = (
        "VREG-" + hashlib.sha256(f"{validator_id}|{action}|{isoformat(now)}".encode()).hexdigest()[:24]
    )
    return new_event(
        "keputusan.dicatat",
        source=SERVICE,
        subject=decision_id,
        data={
            "decision_id": decision_id,
            "actor": {"kind": "rule", "name": "validator_registration", "service": SERVICE},
            "action": action,
            "subject": {"kind": "validator", "id": validator_id},
            "reason": reason,
            "evidence_refs": [],
            "occurred_at": isoformat(now),
            "synthetic": bool(synthetic),
        },
    )


def _activated(validator_id: str, row: dict[str, Any], now: datetime) -> dict[str, Any]:
    return new_event(
        "validator.diaktifkan",
        source=SERVICE,
        subject=validator_id,
        data={
            "validator_ref": validator_id,
            "role": row["role"],
            "field": row["field"],
            "region": row["region"],
            "organization_id": row["organization_id"],
            "tier": row["tier"],
            "status": "probation",
            "activated_at": isoformat(now),
            "synthetic": bool(row["synthetic"]),
        },
    )
