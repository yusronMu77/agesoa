"""Citizen reports from AGESOA Witness: draft -> evidence -> Agen Intake draft -> correction -> submit.

Reporters are anonymous: the bearer token gives an anonymous uid, stored only as a pseudonymous `reporter_ref`
(SHA-256 of the uid). Nothing identifying is asked for or stored; a report is visible only to the device that
created it. Location arrives as approximate coordinates, is turned into a district and dropped. Submitting
publishes `report.received` and a public decision-log entry through the outbox in the same transaction.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from agesoa_packs import DomainPack, evaluate_rules, evidence_status
from agesoa_platform.app import flush_outbox
from agesoa_platform.auth import Principal, authenticate
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
    Response,
    UploadFile,
    status,
)
from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StringConstraints, field_validator
from sqlalchemy import func, insert, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from agesoa_ingestion import SERVICE, regions, social
from agesoa_ingestion.api import EvidenceStatusOut, Label, RuleResultOut
from agesoa_ingestion.intake import IntakeMedia, coerce_fields
from agesoa_ingestion.privacy import MAX_BYTES, EvidenceRejected, clean_evidence
from agesoa_ingestion.tables import evidence, reports, shared_posts

log = logging.getLogger(__name__)
router = APIRouter(prefix="/v1", tags=["reports"])
MAX_EVIDENCE = 10
EvidenceKind = Literal["photo", "audio", "screenshot"]


# --- Contract -------------------------------------------------------------------------------------------------


class Coordinates(BaseModel):
    # Strict: pydantic's lax mode would turn `false` into 0.0 and "1.5" into 1.5; the contract says number.
    lat: StrictFloat = Field(ge=-90, le=90)
    lon: StrictFloat = Field(ge=-180, le=180)


class SharedPostIn(BaseModel):
    url: str = Field(
        min_length=8,
        max_length=social.MAX_URL,
        pattern=social.URL_PATTERN,
        description="Link to a social post, pasted by the reporter",
    )
    excerpt: str | None = Field(
        None, max_length=1000, description="Optional short quote; @handles are masked"
    )


class ReportCreate(BaseModel):
    domain: str = "mbg"
    narrative: str | None = Field(None, max_length=5000)
    location: Coordinates | None = Field(
        None, description="Approximate position; converted to a district on arrival and never stored"
    )
    district_code: str | None = Field(None, max_length=32, description="District picked by hand")
    shared_post: SharedPostIn | None = None


class CustomReportField(BaseModel):
    """Reporter-authored context; never interpreted as a domain rule or an AI extraction."""

    model_config = ConfigDict(extra="forbid")
    label: Annotated[str, StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=80)]
    value: Annotated[
        str, StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=2000)
    ]


class ReportPatch(BaseModel):
    domain: str | None = Field(
        None,
        min_length=1,
        description="Switch a draft to another installed domain pack. Clears its category, fields and Intake proposal; preserves narrative, region and evidence.",
    )
    category: str | None = Field(
        None, min_length=1, description="Category id of the domain pack of the report"
    )
    fields: dict[str, Any] | None = Field(
        None, description="Corrections by field id; null removes a value. Merged into the current fields."
    )
    custom_fields: list[CustomReportField] = Field(
        default_factory=list,
        max_length=20,
        description="Reporter-defined text labels and values, in display order. Replaces the list; [] removes all. Omit to preserve. Separate from pack rules.",
    )
    narrative: str | None = Field(None, max_length=5000)
    location: Coordinates | None = None
    district_code: str | None = Field(None, max_length=32)
    shared_post: SharedPostIn | None = None

    @field_validator("custom_fields")
    @classmethod
    def unique_custom_labels(cls, fields: list[CustomReportField]) -> list[CustomReportField]:
        labels = [field.label.casefold() for field in fields]
        if len(labels) != len(set(labels)):
            raise ValueError("custom field labels must be unique")
        return fields


class Region(BaseModel):
    regency_code: str | None = None
    regency_name: str
    district_code: str | None = None
    district_name: str | None = None


class DistrictOut(Region):
    synthetic: bool


class EvidenceOut(BaseModel):
    evidence_id: str
    kind: EvidenceKind
    media_type: str
    sha256: str = Field(description="SHA-256 of the stored file (after metadata removal)")
    size_bytes: int
    metadata_removed: bool
    faces_blurred: int = Field(0, description="Faces found in the image and blurred before storage")


class SharedPostOut(BaseModel):
    id: str
    url: str = Field(description="Canonical link without the poster's username")
    platform: str
    excerpt: str | None
    reports: int = Field(description="Reports that shared this post (reposts count once per report)")


class IntakeOut(BaseModel):
    """What Agen Intake proposed. Shown as an AI result; the reporter's corrections are in `fields`."""

    model: str
    category: str | None
    fields: dict[str, Any]
    transcript: str | None
    drafted_at: datetime


class Report(BaseModel):
    id: str
    status: Literal["draft", "submitted"]
    domain: str
    category: str | None
    narrative: str | None
    fields: dict[str, Any]
    custom_fields: list[CustomReportField]
    missing_required: list[str]
    rule_results: list[RuleResultOut]
    evidence_status: EvidenceStatusOut | None
    evidence_tips: list[Label]
    evidence: list[EvidenceOut]
    region: Region | None
    shared_post: SharedPostOut | None
    intake: IntakeOut | None
    synthetic: bool
    created_at: datetime
    updated_at: datetime
    submitted_at: datetime | None


Reporter = Annotated[Principal, Depends(authenticate)]
NOT_FOUND = {404: {"description": "No such report for this reporter"}}
DRAFT_ONLY = {409: {"description": "The report was already submitted"}}


# --- Helpers --------------------------------------------------------------------------------------------------


def reporter_ref(principal: Principal) -> str:
    """Pseudonymous, stable per anonymous uid; the uid itself is not stored."""
    return principal.reporter_ref


def _pack(request: Request, pack_id: str) -> DomainPack:
    pack = request.app.state.packs.get(pack_id)
    if pack is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"unknown domain {pack_id!r}")
    return pack


async def _load(session: AsyncSession, report_id: str, principal: Principal, *, lock: bool = False):
    query = select(reports).where(
        reports.c.id == report_id, reports.c.reporter_ref == reporter_ref(principal)
    )
    row = (await session.execute(query.with_for_update() if lock else query)).one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "report not found")
    return row


def _require_draft(row) -> None:
    if row.status != "draft":
        raise HTTPException(status.HTTP_409_CONFLICT, "report already submitted")


async def _district(
    session: AsyncSession, location: Coordinates | None, code: str | None
) -> regions.District | None:
    if code:
        district = await regions.get(session, code)
        if district is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"unknown district {code!r}")
        return district
    if location:
        return await regions.resolve(session, location.lat, location.lon)
    return None


async def _shared_post_id(session: AsyncSession, post: SharedPostIn) -> str:
    try:
        canonical = social.canonical_post(post.url)
    except social.InvalidPostUrl as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"shared_post.url: {exc}") from None
    existing = await session.scalar(
        select(shared_posts.c.id).where(shared_posts.c.canonical_url == canonical.url)
    )
    if existing:
        return existing
    post_id = uuid.uuid4().hex
    await session.execute(
        pg_insert(shared_posts)
        .values(
            id=post_id,
            canonical_url=canonical.url,
            platform=canonical.platform,
            excerpt=social.mask_handles(post.excerpt),
        )
        .on_conflict_do_nothing(index_elements=["canonical_url"])
    )
    return await session.scalar(
        select(shared_posts.c.id).where(shared_posts.c.canonical_url == canonical.url)
    )


def _evaluation(pack: DomainPack, fields: dict[str, Any], received_at: datetime):
    results = evaluate_rules(pack, fields)
    evidence_ = evidence_status(pack, fields, received_at)
    return results, evidence_


async def _view(session: AsyncSession, request: Request, row) -> Report:
    pack = _pack(request, row.domain)
    received = row.submitted_at or utc_now()
    results, ev = _evaluation(pack, row.fields, received)
    files = (
        await session.execute(
            select(evidence).where(evidence.c.report_id == row.id).order_by(evidence.c.created_at)
        )
    ).all()
    post = None
    if row.shared_post_id:
        p = (await session.execute(select(shared_posts).where(shared_posts.c.id == row.shared_post_id))).one()
        count = await session.scalar(
            select(func.count()).select_from(reports).where(reports.c.shared_post_id == p.id)
        )
        post = SharedPostOut(
            id=p.id, url=p.canonical_url, platform=p.platform, excerpt=p.excerpt, reports=count or 0
        )
    return Report(
        id=row.id,
        status=row.status,
        domain=row.domain,
        category=row.category,
        narrative=row.narrative,
        fields=row.fields,
        custom_fields=row.custom_fields,
        missing_required=[f for f in pack.required_field_ids() if row.fields.get(f) in (None, "", [])],
        rule_results=[
            RuleResultOut(rule_id=r.rule_id, violated=r.violated, detail=r.detail) for r in results
        ],
        evidence_status=EvidenceStatusOut(**ev.__dict__),
        evidence_tips=pack.document["evidence_tips"] if ev.status == "available" else [],
        evidence=[
            EvidenceOut(
                evidence_id=f.id,
                kind=f.kind,
                media_type=f.media_type,
                sha256=f.sha256,
                size_bytes=f.size_bytes,
                metadata_removed=f.kind != "audio",
            )
            for f in files
        ],
        region=Region(**row.region) if row.region else None,
        shared_post=post,
        intake=IntakeOut(**row.intake) if row.intake else None,
        synthetic=row.synthetic,
        created_at=row.created_at,
        updated_at=row.updated_at,
        submitted_at=row.submitted_at,
    )


async def _respond(request: Request, report_id: str, principal: Principal) -> Report:
    async with request.app.state.db.sessions() as session:
        return await _view(session, request, await _load(session, report_id, principal))


# --- Regions --------------------------------------------------------------------------------------------------


@router.get("/regions/districts", tags=["regions"], summary="Districts for manual selection")
async def list_districts(request: Request, reporter: Reporter) -> list[DistrictOut]:
    async with request.app.state.db.sessions() as session:
        return [DistrictOut(**d.model_dump()) for d in await regions.list_all(session)]


@router.post(
    "/regions/resolve",
    tags=["regions"],
    summary="Approximate position -> district (the position is not stored or logged)",
    responses={404: {"description": "Outside every known district; pick one by hand"}},
)
async def resolve_district(body: Coordinates, request: Request, reporter: Reporter) -> DistrictOut:
    async with request.app.state.db.sessions() as session:
        district = await regions.resolve(session, body.lat, body.lon)
    if district is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no district at this position")
    return DistrictOut(**district.model_dump())


# --- Reports --------------------------------------------------------------------------------------------------


@router.post("/reports", status_code=201, summary="Start a report draft (anonymous)")
async def create_report(body: ReportCreate, request: Request, reporter: Reporter) -> Report:
    _pack(request, body.domain)
    report_id = uuid.uuid4().hex
    async with request.app.state.db.transaction() as session:
        district = await _district(session, body.location, body.district_code)
        post_id = await _shared_post_id(session, body.shared_post) if body.shared_post else None
        await session.execute(
            insert(reports).values(
                id=report_id,
                status="draft",
                domain=body.domain,
                narrative=body.narrative,
                fields={},
                rule_results=[],
                region=district.region() if district else None,
                shared_post_id=post_id,
                reporter_ref=reporter_ref(reporter),
                synthetic=bool(district and district.synthetic),
            )
        )
    return await _respond(request, report_id, reporter)


@router.get("/reports/{report_id}", summary="Read one of my reports", responses=NOT_FOUND)
async def get_report(report_id: str, request: Request, reporter: Reporter) -> Report:
    return await _respond(request, report_id, reporter)


@router.patch(
    "/reports/{report_id}",
    summary="Correct a draft",
    responses={**NOT_FOUND, **DRAFT_ONLY, 422: {"description": "Unknown category/field or wrong value type"}},
)
async def patch_report(report_id: str, body: ReportPatch, request: Request, reporter: Reporter) -> Report:
    async with request.app.state.db.transaction() as session:
        row = await _load(session, report_id, reporter, lock=True)
        _require_draft(row)
        values: dict[str, Any] = {"updated_at": func.now()}
        sent = body.model_fields_set
        if "domain" in sent and body.domain is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "domain cannot be null")
        pack = _pack(request, body.domain or row.domain)
        changing_domain = pack.id != row.domain
        if changing_domain:
            values.update(domain=pack.id, category=None, fields={}, intake=None, rule_results=[])
        if "category" in sent:
            if body.category is not None and body.category not in pack.category_ids:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_CONTENT, f"unknown category {body.category!r}"
                )
            values["category"] = body.category
        if body.fields is not None:
            merged = {**({} if changing_domain else row.fields), **body.fields}
            try:
                values["fields"] = coerce_fields(pack, merged, strict=True)
            except ValueError as exc:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"fields: {exc}") from None
        if "narrative" in sent:
            values["narrative"] = body.narrative
        if "custom_fields" in sent:
            values["custom_fields"] = [field.model_dump() for field in body.custom_fields]
        if body.location or body.district_code:
            district = await _district(session, body.location, body.district_code)
            values["region"] = district.region() if district else None
            values["synthetic"] = bool(district and district.synthetic)
        if "shared_post" in sent:
            values["shared_post_id"] = (
                await _shared_post_id(session, body.shared_post) if body.shared_post else None
            )
        await session.execute(update(reports).where(reports.c.id == row.id).values(**values))
    return await _respond(request, report_id, reporter)


@router.post(
    "/reports/{report_id}/evidence",
    status_code=201,
    summary="Upload one evidence file (photo, screenshot or voice note); metadata is removed before storage",
    responses={
        **NOT_FOUND,
        **DRAFT_ONLY,
        413: {"description": f"File larger than {MAX_BYTES // (1024 * 1024)} MB"},
        415: {"description": "Not an accepted image/audio format"},
        422: {"description": f"More than {MAX_EVIDENCE} files"},
    },
)
async def upload_evidence(
    report_id: str,
    request: Request,
    reporter: Reporter,
    kind: Annotated[EvidenceKind, Form()],
    file: Annotated[
        UploadFile,
        File(
            description="The file; its declared content type is not trusted",
            json_schema_extra={"minLength": 1},
        ),
    ],
) -> EvidenceOut:
    data = await file.read(MAX_BYTES + 1)
    try:
        clean = clean_evidence(kind, data)
    except EvidenceRejected as exc:
        raise HTTPException(exc.status_code, str(exc)) from None
    evidence_id = uuid.uuid4().hex
    object_path = f"reports/{report_id}/{evidence_id}"
    async with request.app.state.db.transaction() as session:
        row = await _load(session, report_id, reporter, lock=True)
        _require_draft(row)
        count = await session.scalar(
            select(func.count()).select_from(evidence).where(evidence.c.report_id == report_id)
        )
        if (count or 0) >= MAX_EVIDENCE:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, f"at most {MAX_EVIDENCE} files per report"
            )
        # Stored before the row commits: a failed commit leaves an orphan object, never a row without its file.
        await request.app.state.media.put(object_path, clean.data, clean.media_type)
        await session.execute(
            insert(evidence).values(
                id=evidence_id,
                report_id=report_id,
                media_type=clean.media_type,
                sha256=clean.sha256,
                object_path=object_path,
                kind=kind,
                size_bytes=len(clean.data),
            )
        )
        await session.execute(update(reports).where(reports.c.id == report_id).values(updated_at=func.now()))
    return EvidenceOut(
        evidence_id=evidence_id,
        kind=kind,
        media_type=clean.media_type,
        sha256=clean.sha256,
        size_bytes=len(clean.data),
        metadata_removed=clean.removed_metadata,
        faces_blurred=clean.faces_blurred,
    )


@router.get(
    "/reports/{report_id}/evidence/{evidence_id}",
    summary="Download one of my stored evidence files (as stored: after metadata removal)",
    response_class=Response,
    responses={**NOT_FOUND, 200: {"content": {"application/octet-stream": {}}}},
)
async def download_evidence(
    report_id: str, evidence_id: str, request: Request, reporter: Reporter
) -> Response:
    async with request.app.state.db.sessions() as session:
        await _load(session, report_id, reporter)
        row = (
            await session.execute(
                select(evidence).where(evidence.c.id == evidence_id, evidence.c.report_id == report_id)
            )
        ).one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "evidence not found")
    data = await request.app.state.media.get(row.object_path)
    return Response(data, media_type=row.media_type, headers={"Cache-Control": "private, no-store"})


@router.post(
    "/reports/{report_id}/intake",
    summary="Run Agen Intake on the narrative and evidence; fills the draft (AI result, to be corrected)",
    responses={
        **NOT_FOUND,
        **DRAFT_ONLY,
        503: {"description": "Agen Intake is unavailable; fill the draft by hand"},
    },
)
async def run_intake(report_id: str, request: Request, reporter: Reporter) -> Report:
    async with request.app.state.db.sessions() as session:
        row = await _load(session, report_id, reporter)
        _require_draft(row)
        files = (await session.execute(select(evidence).where(evidence.c.report_id == report_id))).all()
    agent = request.app.state.intake[row.domain]
    intake_domain = row.domain
    # Photos and at most one voice note go to the model (one audio per prompt).
    media, audio_seen = [], False
    for f in files:
        if f.kind == "audio":
            if audio_seen:
                continue
            audio_seen = True
        media.append(IntakeMedia(await request.app.state.media.get(f.object_path), f.media_type))
    try:
        draft = await agent.draft(row.narrative, media, utc_now())
    except Exception:
        log.exception("intake failed", extra={"detail": {"report_id": report_id}})
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Agen Intake unavailable") from None
    async with request.app.state.db.transaction() as session:
        row = await _load(session, report_id, reporter, lock=True)
        _require_draft(row)
        if row.domain != intake_domain:
            raise HTTPException(status.HTTP_409_CONFLICT, "report form changed; run Intake again")
        await session.execute(
            update(reports)
            .where(reports.c.id == report_id)
            .values(
                intake={**draft.as_record(), "drafted_at": isoformat(utc_now())},
                # Draft values fill the report; anything the reporter already corrected is kept.
                category=row.category or draft.category,
                fields={**draft.fields, **row.fields},
                updated_at=func.now(),
            )
        )
    return await _respond(request, report_id, reporter)


@router.post(
    "/reports/{report_id}/submit",
    summary="Confirm the draft; publishes report.received and a decision-log entry",
    responses={
        **NOT_FOUND,
        **DRAFT_ONLY,
        422: {"description": "No category yet, or nothing to report (no narrative and no evidence)"},
    },
)
async def submit_report(
    report_id: str, request: Request, reporter: Reporter, background: BackgroundTasks
) -> Report:
    async with request.app.state.db.transaction() as session:
        row = await _load(session, report_id, reporter, lock=True)
        _require_draft(row)
        pack = _pack(request, row.domain)
        if not row.category:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "choose a category first")
        files = (
            await session.execute(
                select(evidence).where(evidence.c.report_id == report_id).order_by(evidence.c.created_at)
            )
        ).all()
        if not files and not (row.narrative or "").strip() and not row.shared_post_id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "add a description or evidence first")
        now = utc_now()
        results, ev = _evaluation(pack, row.fields, now)
        await session.execute(
            update(reports)
            .where(reports.c.id == report_id)
            .values(
                status="submitted",
                submitted_at=now,
                updated_at=now,
                rule_results=[r.as_event() | {"evaluated": r.violated is not None} for r in results],
            )
        )
        evidence_list = [{"evidence_id": f.id, "media_type": f.media_type, "sha256": f.sha256} for f in files]
        await add_event(
            session,
            new_event(
                "report.received",
                source=SERVICE,
                subject=report_id,
                data={
                    "report_id": report_id,
                    "domain": row.domain,
                    "category": row.category,
                    "received_at": isoformat(now),
                    "region": row.region,
                    "fields": row.fields,
                    "custom_fields": row.custom_fields,
                    # Not evaluable (missing field) is not a violation; such rules are left out of the event.
                    "rule_results": [r.as_event() for r in results if r.violated is not None],
                    "evidence": evidence_list,
                    "reporter_ref": row.reporter_ref,
                    "synthetic": row.synthetic,
                },
            ),
        )
        await add_event(session, _received_decision(row, results, ev, evidence_list, now))
    background.add_task(flush_outbox, request)
    return await _respond(request, report_id, reporter)


def _received_decision(row, results, ev, evidence_list, now) -> dict[str, Any]:
    corrected = sorted(
        k for k, v in row.fields.items() if row.intake and row.intake.get("fields", {}).get(k) != v
    )
    violated = [r.rule_id for r in results if r.violated]
    reason = (
        f"Report confirmed by the reporter: category {row.category}, {len(evidence_list)} evidence file(s)"
        f" hashed. Agen Intake draft: {row.intake['model'] if row.intake else 'not used'}"
        f"; fields corrected by the reporter: {', '.join(corrected) or 'none'}."
        f" Rules violated (computed by code): {', '.join(violated) or 'none'}."
        f" Evidence deadline: {ev.status}."
    )
    decision_id = f"RPT-{row.id[:12]}-received"
    return new_event(
        "decision.recorded",
        source=SERVICE,
        subject=decision_id,
        data={
            "decision_id": decision_id,
            "actor": {"kind": "human", "name": "anonymous reporter", "service": SERVICE},
            "action": "report.received",
            "subject": {"kind": "report", "id": row.id},
            "reason": reason,
            "evidence_refs": [e["evidence_id"] for e in evidence_list],
            "status_label": "alleged",
            "occurred_at": isoformat(now),
            "synthetic": row.synthetic,
        },
    )
