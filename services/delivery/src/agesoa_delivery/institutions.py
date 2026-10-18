"""Institution side of delivery: the agency dashboard (SCR-062: webhook subscription, test event, API key, delivery
history) for the organization's admin, the institution API (status + right of reply, API key), and the internal
endpoints that run webhook attempts (Cloud Tasks) and create fictional audit reports in demo_mode.

Only the admin of a verified agency (learned from `organisasi.terverifikasi`) manages its subscription. Institutions
can only report on cases AGESOA delivered to them, and never change a finding.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime
from typing import Annotated, Any, Literal

from agesoa_platform.app import flush_outbox
from agesoa_platform.auth import Principal, require_role
from agesoa_platform.demo import require_demo_mode
from agesoa_platform.events import isoformat, new_event, utc_now
from agesoa_platform.oidc import require_internal_caller
from agesoa_platform.outbox import add_event
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select, update

from agesoa_delivery import SERVICE
from agesoa_delivery.tables import (
    audit_reports,
    deliveries,
    follow_ups,
    institutions,
    replies,
    subscriptions,
    webhook_jobs,
)
from agesoa_delivery.webhooks import attempt, new_id, schedule_first, stage_report, stage_test_event

router = APIRouter(tags=["institutions"])
institution_api = APIRouter(prefix="/api/v1", tags=["institution API"])
internal = APIRouter(prefix="/internal", tags=["internal"], dependencies=[Depends(require_internal_caller)])

OrgAdmin = Annotated[Principal, Depends(require_role("org_admin"))]
NOT_FOUND = {404: {"description": "No verified agency with this id administered by the caller"}}


def key_hash(api_key: str) -> str:
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()


# --- Agency dashboard (organization admin) ---


class SubscriptionView(BaseModel):
    id: str
    webhook_url: str
    region_code: str | None
    category: str | None
    active: bool
    created_at: datetime


class ApiKeyView(BaseModel):
    prefix: str
    created_at: datetime


class Institution(BaseModel):
    organization_id: str
    name: str
    kind: Literal["newsroom", "agency"]
    synthetic: bool
    subscription: SubscriptionView | None
    api_key: ApiKeyView | None


class SubscriptionRequest(BaseModel):
    webhook_url: AnyHttpUrl
    region_code: str | None = Field(
        None, max_length=32, description="Only reports of this regency; null = all"
    )
    category: str | None = Field(None, max_length=48, description="Only reports of this category; null = all")


class SubscriptionCreated(BaseModel):
    subscription: SubscriptionView
    secret: str = Field(description="HMAC secret, shown only once")


class ApiKeyCreated(BaseModel):
    api_key: str = Field(description="Shown only once; only its hash is stored")
    prefix: str
    created_at: datetime


class TestEventQueued(BaseModel):
    delivery_id: str
    event_id: str


class DeliveryAttempt(BaseModel):
    attempt: int
    http_status: int | None
    error: str | None
    attempted_at: datetime


class Delivery(BaseModel):
    delivery_id: str
    event_id: str
    event: Literal["audit_report.final", "test_event"]
    case_id: str
    status: Literal["pending", "delivered", "failed"]
    internal_ticket: str | None
    created_at: datetime
    attempts: list[DeliveryAttempt]


async def _agency(request: Request, organization_id: str, admin: Principal) -> dict[str, Any]:
    async with request.app.state.db.sessions() as session:
        row = (
            (
                await session.execute(
                    select(institutions).where(
                        institutions.c.organization_id == organization_id,
                        institutions.c.admin_ref == admin.uid,
                        institutions.c.kind == "agency",
                    )
                )
            )
            .mappings()
            .one_or_none()
        )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "institution not found")
    return dict(row)


async def _subscription(session, organization_id: str) -> dict[str, Any] | None:
    row = (
        (
            await session.execute(
                select(subscriptions).where(
                    subscriptions.c.organization_id == organization_id, subscriptions.c.active.is_(True)
                )
            )
        )
        .mappings()
        .one_or_none()
    )
    return dict(row) if row else None


def _subscription_view(row: dict[str, Any]) -> SubscriptionView:
    return SubscriptionView(**{k: row[k] for k in SubscriptionView.model_fields})


@router.get("/v1/institutions/mine", summary="Verified organizations administered by the caller")
async def my_institutions(request: Request, admin: OrgAdmin) -> list[Institution]:
    async with request.app.state.db.sessions() as session:
        rows = (
            (
                await session.execute(
                    select(institutions)
                    .where(institutions.c.admin_ref == admin.uid)
                    .order_by(institutions.c.organization_id)
                )
            )
            .mappings()
            .all()
        )
        result = []
        for row in rows:
            result.append(await _institution(session, dict(row)))
    return result


async def _institution(session, row: dict[str, Any]) -> Institution:
    subscription = await _subscription(session, row["organization_id"])
    return Institution(
        organization_id=row["organization_id"],
        name=row["name"],
        kind=row["kind"],
        synthetic=row["synthetic"],
        subscription=_subscription_view(subscription) if subscription else None,
        api_key=(
            ApiKeyView(prefix=row["api_key_prefix"], created_at=row["api_key_created_at"])
            if row["api_key_hash"]
            else None
        ),
    )


@router.get("/v1/institutions/{organization_id}", summary="Agency dashboard (SCR-062)", responses=NOT_FOUND)
async def get_institution(organization_id: str, request: Request, admin: OrgAdmin) -> Institution:
    row = await _agency(request, organization_id, admin)
    async with request.app.state.db.sessions() as session:
        return await _institution(session, row)


@router.put(
    "/v1/institutions/{organization_id}/subscription",
    summary="Subscribe a webhook (replaces the current one); the HMAC secret is returned only here",
    responses=NOT_FOUND | {422: {"description": "Invalid URL (https required outside local)"}},
)
async def subscribe(
    organization_id: str, body: SubscriptionRequest, request: Request, admin: OrgAdmin
) -> SubscriptionCreated:
    settings = request.app.state.settings
    institution = await _agency(request, organization_id, admin)
    if body.webhook_url.scheme != "https" and not settings.is_local:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "webhook_url must use https")
    subscription_id = new_id("SUB-")
    secret = "whsec_" + secrets.token_urlsafe(32)
    secret_ref = await request.app.state.secrets.put(subscription_id.lower(), secret)
    async with request.app.state.db.transaction() as session:
        await session.execute(
            update(subscriptions)
            .where(subscriptions.c.organization_id == organization_id, subscriptions.c.active.is_(True))
            .values(active=False)
        )
        await session.execute(
            subscriptions.insert().values(
                id=subscription_id,
                organization_id=organization_id,
                region_code=body.region_code,
                category=body.category,
                webhook_url=str(body.webhook_url),
                secret_ref=secret_ref,
                synthetic=institution["synthetic"],
            )
        )
        created = await _subscription(session, organization_id)
    return SubscriptionCreated(subscription=_subscription_view(created), secret=secret)


@router.post(
    "/v1/institutions/{organization_id}/api-key",
    status_code=201,
    summary="Create the institution API key (replaces the previous one); returned only here",
    responses=NOT_FOUND,
)
async def create_api_key(organization_id: str, request: Request, admin: OrgAdmin) -> ApiKeyCreated:
    await _agency(request, organization_id, admin)
    api_key = "agk_" + secrets.token_urlsafe(32)
    now = utc_now()
    async with request.app.state.db.transaction() as session:
        await session.execute(
            update(institutions)
            .where(institutions.c.organization_id == organization_id)
            .values(api_key_hash=key_hash(api_key), api_key_prefix=api_key[:10], api_key_created_at=now)
        )
    return ApiKeyCreated(api_key=api_key, prefix=api_key[:10], created_at=now)


@router.post(
    "/v1/institutions/{organization_id}/test-event",
    status_code=202,
    summary="Send a test_event to the subscribed webhook",
    responses=NOT_FOUND | {409: {"description": "No active webhook subscription"}},
)
async def send_test_event(organization_id: str, request: Request, admin: OrgAdmin) -> TestEventQueued:
    institution = await _agency(request, organization_id, admin)
    async with request.app.state.db.transaction() as session:
        subscription = await _subscription(session, organization_id)
        if subscription is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "no active webhook subscription")
        queued = await stage_test_event(
            session, subscription, institution["name"], request.app.state.settings.portal_url
        )
    await schedule_first(request.app, [queued["delivery_id"]])
    return TestEventQueued(**queued)


@router.get(
    "/v1/institutions/{organization_id}/deliveries",
    summary="Webhook delivery history, newest first, with every attempt",
    responses=NOT_FOUND,
)
async def delivery_history(organization_id: str, request: Request, admin: OrgAdmin) -> list[Delivery]:
    await _agency(request, organization_id, admin)
    async with request.app.state.db.sessions() as session:
        jobs = (
            (
                await session.execute(
                    select(webhook_jobs)
                    .where(webhook_jobs.c.organization_id == organization_id)
                    .order_by(webhook_jobs.c.created_at.desc())
                    .limit(50)
                )
            )
            .mappings()
            .all()
        )
        ids = [j["delivery_id"] for j in jobs]
        attempts = (
            (
                await session.execute(
                    select(deliveries).where(deliveries.c.delivery_id.in_(ids)).order_by(deliveries.c.attempt)
                )
            )
            .mappings()
            .all()
            if ids
            else []
        )
    by_job: dict[str, list[DeliveryAttempt]] = {}
    for a in attempts:
        by_job.setdefault(a["delivery_id"], []).append(
            DeliveryAttempt(
                attempt=a["attempt"],
                http_status=a["http_status"],
                error=a["error"],
                attempted_at=a["attempted_at"],
            )
        )
    return [
        Delivery(
            **{k: j[k] for k in ("delivery_id", "event_id", "event", "case_id", "status", "internal_ticket")},
            created_at=j["created_at"],
            attempts=by_job.get(j["delivery_id"], []),
        )
        for j in jobs
    ]


# --- Institution API (API key) ---

_institution_key = HTTPBearer(
    scheme_name="InstitutionApiKey", description="Bearer <institution API key>", auto_error=False
)
UNAUTHORIZED = {401: {"description": "Missing or invalid institution API key"}}
NOT_DELIVERED = {404: {"description": "No audit report of this case was delivered to this institution"}}


async def institution_by_key(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_institution_key)],
) -> dict[str, Any]:
    if credentials is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "missing institution API key",
            headers={"WWW-Authenticate": "Bearer"},
        )
    async with request.app.state.db.sessions() as session:
        row = (
            (
                await session.execute(
                    select(institutions).where(
                        institutions.c.api_key_hash == key_hash(credentials.credentials)
                    )
                )
            )
            .mappings()
            .one_or_none()
        )
    if row is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "invalid institution API key",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return dict(row)


InstitutionByKey = Annotated[dict[str, Any], Depends(institution_by_key)]


class StatusUpdate(BaseModel):
    status: Literal["received", "in_progress", "done"]
    note: str = Field("", max_length=4000)
    internal_ticket: str | None = Field(None, max_length=120)


class Attachment(BaseModel):
    name: str = Field(max_length=200)
    url: AnyHttpUrl


class Reply(BaseModel):
    body: str = Field(min_length=1, max_length=10000)
    attachments: list[Attachment] = Field([], max_length=10)


class Accepted(BaseModel):
    id: str
    received_at: datetime


async def _delivered(session, organization_id: str, case_id: str) -> dict[str, Any]:
    job = (
        (
            await session.execute(
                select(webhook_jobs.c.synthetic)
                .where(
                    webhook_jobs.c.organization_id == organization_id,
                    webhook_jobs.c.case_id == case_id,
                    webhook_jobs.c.event == "audit_report.final",
                    webhook_jobs.c.status == "delivered",
                )
                .limit(1)
            )
        )
        .mappings()
        .one_or_none()
    )
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "case not delivered to this institution")
    return dict(job)


def _institution_decision(
    case_id: str, institution: dict[str, Any], action: str, reason: str, now, synthetic
):
    decision_id = "INST-" + secrets.token_hex(12)
    return new_event(
        "keputusan.dicatat",
        source=SERVICE,
        subject=decision_id,
        data={
            "decision_id": decision_id,
            "actor": {"kind": "human", "name": f"institution: {institution['name']}", "service": SERVICE},
            "action": action,
            "subject": {"kind": "case", "id": case_id},
            "reason": reason,
            "evidence_refs": [],
            "occurred_at": isoformat(now),
            "synthetic": synthetic,
        },
    )


@institution_api.post(
    "/cases/{case_id}/status",
    status_code=202,
    summary="Institution updates the follow-up status of a case",
    responses=UNAUTHORIZED | NOT_DELIVERED,
)
async def update_status(
    case_id: str, body: StatusUpdate, request: Request, institution: InstitutionByKey, tasks: BackgroundTasks
) -> Accepted:
    now = utc_now()
    async with request.app.state.db.transaction() as session:
        job = await _delivered(session, institution["organization_id"], case_id)
        row_id = (
            await session.execute(
                follow_ups.insert()
                .values(
                    case_id=case_id,
                    organization_id=institution["organization_id"],
                    status=body.status,
                    note=body.note,
                    internal_ticket=body.internal_ticket,
                    created_at=now,
                )
                .returning(follow_ups.c.id)
            )
        ).scalar_one()
        await add_event(
            session,
            new_event(
                "tindak_lanjut.diperbarui",
                source=SERVICE,
                subject=case_id,
                data={
                    "case_id": case_id,
                    "organization_id": institution["organization_id"],
                    "status": body.status,
                    "note": body.note,
                    "internal_ticket": body.internal_ticket,
                    "updated_at": isoformat(now),
                    "synthetic": job["synthetic"],
                },
            ),
        )
        await add_event(
            session,
            _institution_decision(
                case_id,
                institution,
                "follow_up.updated",
                f"Follow-up status set to {body.status} by the institution.",
                now,
                job["synthetic"],
            ),
        )
    tasks.add_task(flush_outbox, request)
    return Accepted(id=f"FU-{row_id}", received_at=now)


@institution_api.post(
    "/cases/{case_id}/reply",
    status_code=202,
    summary="Institution submits a right of reply (shown labelled next to the finding)",
    responses=UNAUTHORIZED | NOT_DELIVERED,
)
async def submit_reply(
    case_id: str, body: Reply, request: Request, institution: InstitutionByKey, tasks: BackgroundTasks
) -> Accepted:
    now = utc_now()
    reply_id = new_id("RPL-")
    attachments = [{"name": a.name, "url": str(a.url)} for a in body.attachments]
    async with request.app.state.db.transaction() as session:
        job = await _delivered(session, institution["organization_id"], case_id)
        await session.execute(
            replies.insert().values(
                id=reply_id,
                case_id=case_id,
                organization_id=institution["organization_id"],
                body=body.body,
                attachments=attachments,
                received_at=now,
            )
        )
        await add_event(
            session,
            new_event(
                "hak_jawab.diterima",
                source=SERVICE,
                subject=case_id,
                data={
                    "reply_id": reply_id,
                    "case_id": case_id,
                    "organization_id": institution["organization_id"],
                    "body": body.body,
                    "attachments": attachments,
                    "received_at": isoformat(now),
                    "synthetic": job["synthetic"],
                },
            ),
        )
        await add_event(
            session,
            _institution_decision(
                case_id,
                institution,
                "right_of_reply.received",
                "Right of reply received.",
                now,
                job["synthetic"],
            ),
        )
    tasks.add_task(flush_outbox, request)
    return Accepted(id=reply_id, received_at=now)


# --- Internal ---


class AttemptResult(BaseModel):
    result: str


@internal.post(
    "/webhooks/{delivery_id}/attempts/{number}",
    summary="Run one webhook attempt (called by Cloud Tasks)",
)
async def run_attempt(delivery_id: str, number: int, request: Request) -> AttemptResult:
    return AttemptResult(result=await attempt(request.app, delivery_id, number))


class LocalizedText(BaseModel):
    """Contract `localized_text`: the same text per portal language, at least one."""

    model_config = ConfigDict(extra="forbid")
    id: str | None = Field(None, min_length=1, max_length=4000)
    en: str | None = Field(None, min_length=1, max_length=4000)

    @model_validator(mode="after")
    def _one_language(self) -> LocalizedText:
        if self.id is None and self.en is None:
            raise ValueError("at least one language (id, en)")
        return self


def _localized(value: LocalizedText | None) -> dict[str, str] | None:
    return value.model_dump(exclude_none=True) if value else None


class DemoRootCause(BaseModel):
    statement: str = Field(min_length=1, max_length=2000)
    statement_i18n: LocalizedText | None = None
    status: Literal["alleged", "supported", "proven"]
    evidence_refs: list[str] = []


class DemoAuditReport(BaseModel):
    case_id: str = Field(min_length=1, max_length=32)
    domain: str = "mbg"
    category: str | None = Field(None, max_length=48)
    summary: str = Field(min_length=1, max_length=4000)
    summary_i18n: LocalizedText | None = None
    root_causes: list[DemoRootCause] = Field(min_length=1)
    recommendations: list[str] = []
    recommendations_i18n: list[LocalizedText] | None = Field(
        None, description="Same order and length as recommendations"
    )
    region: dict[str, Any] | None = None

    @model_validator(mode="after")
    def _recommendations_line_up(self) -> DemoAuditReport:
        if self.recommendations_i18n is not None and len(self.recommendations_i18n) != len(
            self.recommendations
        ):
            raise ValueError("recommendations_i18n must have one entry per recommendation")
        return self


class DemoReportCreated(BaseModel):
    audit_report_id: str
    deliveries: list[str]


@internal.post(
    "/demo/audit-reports",
    status_code=201,
    summary="Create a fictional audit report and deliver it (demo_mode only, until the Report agent exists)",
    dependencies=[Depends(require_demo_mode)],
    responses={
        404: {"description": "Not found (also when demo_mode is off)"},
        409: {"description": "Exists"},
    },
)
async def demo_audit_report(body: DemoAuditReport, request: Request) -> DemoReportCreated:
    now = utc_now()
    # The per-language companions only travel in the event (portal); the stored report and the institution
    # webhook keep the plain text.
    report = body.model_dump(exclude={"summary_i18n", "recommendations_i18n"}) | {
        "id": new_id("AR-"),
        "synthetic": True,
        "root_causes": [c.model_dump(exclude={"statement_i18n"}) for c in body.root_causes],
    }
    localized: dict[str, Any] = {}
    if body.summary_i18n:
        localized["summary_i18n"] = _localized(body.summary_i18n)
    if body.recommendations_i18n is not None:
        localized["recommendations_i18n"] = [_localized(r) for r in body.recommendations_i18n]
    event_causes = [
        c | ({"statement_i18n": _localized(src.statement_i18n)} if src.statement_i18n else {})
        for c, src in zip(report["root_causes"], body.root_causes, strict=True)
    ]
    async with request.app.state.db.transaction() as session:
        exists = (
            await session.execute(select(audit_reports.c.id).where(audit_reports.c.case_id == body.case_id))
        ).scalar()
        if exists:
            raise HTTPException(status.HTTP_409_CONFLICT, "audit report exists for this case")
        await session.execute(audit_reports.insert().values(**report, created_at=now))
        await add_event(
            session,
            new_event(
                "laporan_audit.dibuat",
                source=SERVICE,
                subject=body.case_id,
                data={
                    "audit_report_id": report["id"],
                    "case_id": body.case_id,
                    "domain": body.domain,
                    "summary": body.summary,
                    "root_causes": event_causes,
                    "recommendations": body.recommendations,
                    **localized,
                    "region": body.region,
                    "created_at": isoformat(now),
                    "synthetic": True,
                },
            ),
        )
        staged = await stage_report(session, report, request.app.state.settings.portal_url)
    await request.app.state.outbox.dispatch()
    await schedule_first(request.app, staged)
    return DemoReportCreated(audit_report_id=report["id"], deliveries=staged)
