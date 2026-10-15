"""Signed webhooks to institutions (packages/contracts/webhook/README.md).

An audit report (or a test event from the institution's dashboard) becomes one `webhook_jobs` row per matching
subscription, staged in the caller's transaction; after commit the first attempt is scheduled. Each attempt signs
the stored body with the subscription secret (HMAC-SHA256 over `<timestamp>.<body>`), records a `deliveries` row and
either finishes the job or schedules the next retry (30 s, 2 min, 10 min by default). Retries keep the event id, so
the receiver deduplicates them.

Attempts run on Cloud Tasks outside local (the task calls `/internal/webhooks/{delivery_id}/attempts/{n}`), and on an
in-process scheduler in the devenv and tests. A task that runs twice is harmless: an attempt only counts when the job
is still pending at the expected attempt number.
"""

from __future__ import annotations

import asyncio
import json
import logging
import secrets
import time
import uuid
from datetime import datetime, timedelta
from typing import Any, Protocol

import httpx
from agesoa_contracts import validate_webhook_body
from agesoa_platform.events import isoformat, new_event, utc_now
from agesoa_platform.hmac import sign_webhook
from agesoa_platform.outbox import add_event
from fastapi import FastAPI
from sqlalchemy import and_, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from agesoa_delivery import SERVICE
from agesoa_delivery.gcp import auth_headers
from agesoa_delivery.tables import case_validations, deliveries, institutions, subscriptions, webhook_jobs

log = logging.getLogger(__name__)
TEST_CASE_PREFIX = "TEST-"


def new_id(prefix: str) -> str:
    return prefix + secrets.token_hex(8).upper()


# --- Bodies ---


def _region_name(region: dict[str, Any] | None) -> str:
    return (region or {}).get("regency_name") or "unknown"


async def report_body(session: AsyncSession, report: dict[str, Any], portal_url: str, event_id: str) -> str:
    labels = (
        await session.execute(
            select(case_validations.c.labels).where(case_validations.c.case_id == report["case_id"])
        )
    ).scalar() or []
    body = {
        "event": "audit_report.final",
        "event_id": event_id,
        "case": {
            "id": report["case_id"],
            "domain": report["domain"],
            "category": report.get("category") or "unspecified",
            "region": _region_name(report.get("region")),
            "summary": report["summary"],
            "root_causes": [
                {
                    "statement": c["statement"],
                    "status": c["status"],
                    "evidence": list(c.get("evidence_refs", [])),
                }
                for c in report["root_causes"]
            ],
            "recommendations": list(report.get("recommendations") or []),
            "validations": list(labels),
            "url": f"{portal_url.rstrip('/')}/cases/{report['case_id']}",
            "synthetic": bool(report.get("synthetic")),
        },
        "parties_mentioned": [],
    }
    validate_webhook_body(body)
    return json.dumps(body, ensure_ascii=False, separators=(",", ":"))


def test_body(portal_url: str, event_id: str, institution_name: str) -> tuple[str, str]:
    case_id = TEST_CASE_PREFIX + secrets.token_hex(6).upper()
    body = {
        "event": "test_event",
        "event_id": event_id,
        "case": {
            "id": case_id,
            "domain": "test",
            "category": "test",
            "region": "test",
            "summary": f"Test event for {institution_name}: no action needed.",
            "root_causes": [{"statement": "Test root cause", "status": "alleged", "evidence": []}],
            "recommendations": ["No action: this is a test event."],
            "validations": [],
            "url": f"{portal_url.rstrip('/')}/",
            "synthetic": True,
        },
        "parties_mentioned": [],
    }
    validate_webhook_body(body)
    return case_id, json.dumps(body, ensure_ascii=False, separators=(",", ":"))


# --- Staging (inside the caller's transaction) ---


async def stage_report(session: AsyncSession, report: dict[str, Any], portal_url: str) -> list[str]:
    """One job per active agency subscription matching the report's region and category. Returns delivery ids."""
    region_code = (report.get("region") or {}).get("regency_code")
    category = report.get("category")
    rows = (
        await session.execute(
            select(subscriptions.c.id, subscriptions.c.organization_id)
            .join(institutions, institutions.c.organization_id == subscriptions.c.organization_id)
            .where(
                subscriptions.c.active.is_(True),
                institutions.c.kind == "agency",
                or_(subscriptions.c.region_code.is_(None), subscriptions.c.region_code == region_code),
                or_(subscriptions.c.category.is_(None), subscriptions.c.category == category),
            )
        )
    ).all()
    staged = []
    for subscription_id, organization_id in rows:
        event_id = str(uuid.uuid4())
        delivery_id = new_id("DLV-")
        await session.execute(
            webhook_jobs.insert().values(
                delivery_id=delivery_id,
                event_id=event_id,
                event="audit_report.final",
                subscription_id=subscription_id,
                organization_id=organization_id,
                case_id=report["case_id"],
                audit_report_id=report["id"],
                body=await report_body(session, report, portal_url, event_id),
                synthetic=bool(report.get("synthetic")),
            )
        )
        staged.append(delivery_id)
    return staged


async def stage_test_event(
    session: AsyncSession, subscription: dict[str, Any], institution_name: str, portal_url: str
) -> dict[str, str]:
    event_id = str(uuid.uuid4())
    delivery_id = new_id("DLV-")
    case_id, body = test_body(portal_url, event_id, institution_name)
    await session.execute(
        webhook_jobs.insert().values(
            delivery_id=delivery_id,
            event_id=event_id,
            event="test_event",
            subscription_id=subscription["id"],
            organization_id=subscription["organization_id"],
            case_id=case_id,
            body=body,
            synthetic=True,
        )
    )
    return {"delivery_id": delivery_id, "event_id": event_id}


# --- Attempts ---


def _decision(
    case_id: str, organization: dict[str, Any], action: str, reason: str, now: datetime, synthetic: bool
):
    decision_id = "DLVD-" + uuid.uuid4().hex[:24]
    return new_event(
        "keputusan.dicatat",
        source=SERVICE,
        subject=decision_id,
        data={
            "decision_id": decision_id,
            "actor": {"kind": "system", "name": "institution_webhook", "service": SERVICE},
            "action": action,
            "subject": {"kind": "case", "id": case_id},
            "reason": reason,
            "evidence_refs": [],
            "occurred_at": isoformat(now),
            "synthetic": synthetic,
        },
    )


async def attempt(app: FastAPI, delivery_id: str, number: int) -> str:
    """Run attempt `number` (1-based) of a job. Returns what happened (for logs and the internal endpoint)."""
    settings = app.state.settings
    db = app.state.db
    async with db.sessions() as session:
        job = (
            (await session.execute(select(webhook_jobs).where(webhook_jobs.c.delivery_id == delivery_id)))
            .mappings()
            .one_or_none()
        )
        if job is None or job["status"] != "pending" or job["attempts"] != number - 1:
            return "skipped"
        subscription = (
            (await session.execute(select(subscriptions).where(subscriptions.c.id == job["subscription_id"])))
            .mappings()
            .one()
        )
    timestamp = int(time.time())
    body = job["body"].encode("utf-8")
    http_status: int | None = None
    error: str | None = None
    ticket: str | None = None
    try:
        secret = await app.state.secrets.get(subscription["secret_ref"])
        response = await app.state.webhook_client.post(
            subscription["webhook_url"],
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Agesoa-Event": job["event"],
                "X-Agesoa-Event-Id": job["event_id"],
                "X-Agesoa-Timestamp": str(timestamp),
                "X-Agesoa-Signature": sign_webhook(secret, timestamp, body),
            },
            timeout=settings.webhook_timeout,
        )
        http_status = response.status_code
        if response.is_success:
            try:
                ticket = str(response.json().get("internal_ticket") or "")[:120] or None
            except ValueError:
                ticket = None
    except (httpx.HTTPError, KeyError) as exc:
        error = type(exc).__name__
    ok = http_status is not None and 200 <= http_status < 300
    delays = settings.retry_delays
    now = utc_now()
    retry_in: float | None = None
    async with db.transaction() as session:
        claimed = await session.execute(
            update(webhook_jobs)
            .where(
                webhook_jobs.c.delivery_id == delivery_id,
                webhook_jobs.c.status == "pending",
                webhook_jobs.c.attempts == number - 1,
            )
            .values(attempts=number)
        )
        if claimed.rowcount != 1:
            return "skipped"
        await session.execute(
            deliveries.insert().values(
                delivery_id=delivery_id,
                event_id=job["event_id"],
                case_id=job["case_id"],
                organization_id=job["organization_id"],
                attempt=number,
                http_status=http_status,
                error=error,
            )
        )
        final = job["event"] == "audit_report.final"
        organization = {"organization_id": job["organization_id"]}
        if ok:
            await session.execute(
                update(webhook_jobs)
                .where(webhook_jobs.c.delivery_id == delivery_id)
                .values(status="delivered", internal_ticket=ticket, finished_at=now)
            )
            if final:
                await add_event(
                    session,
                    new_event(
                        "laporan_audit.dikirim",
                        source=SERVICE,
                        subject=job["case_id"],
                        data={
                            "audit_report_id": job["audit_report_id"],
                            "case_id": job["case_id"],
                            "organization_id": job["organization_id"],
                            "delivery_id": delivery_id,
                            "http_status": http_status,
                            "attempt": number,
                            "delivered_at": isoformat(now),
                            "synthetic": job["synthetic"],
                        },
                    ),
                )
                await add_event(
                    session,
                    _decision(
                        job["case_id"],
                        organization,
                        "audit_report.delivered",
                        f"Audit report delivered to institution {job['organization_id']} "
                        f"(attempt {number}, HTTP {http_status}).",
                        now,
                        job["synthetic"],
                    ),
                )
        elif number <= len(delays):
            retry_in = delays[number - 1]
        else:
            await session.execute(
                update(webhook_jobs)
                .where(webhook_jobs.c.delivery_id == delivery_id)
                .values(status="failed", finished_at=now)
            )
            if final:
                await add_event(
                    session,
                    _decision(
                        job["case_id"],
                        organization,
                        "audit_report.delivery_failed",
                        f"Webhook to institution {job['organization_id']} failed after {number} attempts.",
                        now,
                        job["synthetic"],
                    ),
                )
    await app.state.outbox.dispatch()
    if retry_in is not None:
        await app.state.webhook_scheduler.schedule(delivery_id, number + 1, retry_in)
        result = f"retry in {retry_in:g}s"
    else:
        result = "delivered" if ok else "failed"
    log.info(
        "webhook attempt",
        extra={
            "detail": {"delivery_id": delivery_id, "attempt": number, "status": http_status, "result": result}
        },
    )
    return result


# --- Schedulers ---


class Scheduler(Protocol):
    async def schedule(self, delivery_id: str, number: int, delay: float) -> None: ...


class LocalScheduler:
    """devenv and tests: attempts run as asyncio tasks of this process (lost on restart, resumed at startup)."""

    def __init__(self, app: FastAPI):
        self.app = app
        self.tasks: set[asyncio.Task] = set()

    async def schedule(self, delivery_id: str, number: int, delay: float) -> None:
        async def run() -> None:
            await asyncio.sleep(delay)
            try:
                await attempt(self.app, delivery_id, number)
            except Exception:
                log.exception("webhook attempt failed", extra={"detail": {"delivery_id": delivery_id}})

        task = asyncio.create_task(run())
        self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)

    async def idle(self) -> None:
        while self.tasks:
            await asyncio.gather(*list(self.tasks), return_exceptions=True)

    async def close(self) -> None:
        for task in list(self.tasks):
            task.cancel()


class CloudTasksScheduler:
    def __init__(
        self, queue: str, self_url: str, invoker_email: str, audience: str, client: httpx.AsyncClient
    ):
        self.queue = queue
        self.self_url = self_url.rstrip("/")
        self.invoker_email = invoker_email
        self.audience = audience
        self.client = client

    async def schedule(self, delivery_id: str, number: int, delay: float) -> None:
        when = utc_now() + timedelta(seconds=delay)
        response = await self.client.post(
            f"https://cloudtasks.googleapis.com/v2/{self.queue}/tasks",
            json={
                "task": {
                    "scheduleTime": isoformat(when),
                    "httpRequest": {
                        "httpMethod": "POST",
                        "url": f"{self.self_url}/internal/webhooks/{delivery_id}/attempts/{number}",
                        "oidcToken": {"serviceAccountEmail": self.invoker_email, "audience": self.audience},
                    },
                }
            },
            headers=await auth_headers(),
        )
        response.raise_for_status()

    async def close(self) -> None:
        return None


async def schedule_first(app: FastAPI, delivery_ids: list[str]) -> None:
    for delivery_id in delivery_ids:
        await app.state.webhook_scheduler.schedule(delivery_id, 1, 0)


async def resume_pending(app: FastAPI) -> int:
    """In-process scheduler only: pick up jobs left pending by a restart."""
    async with app.state.db.sessions() as session:
        rows = (
            await session.execute(
                select(webhook_jobs.c.delivery_id, webhook_jobs.c.attempts).where(
                    and_(webhook_jobs.c.status == "pending")
                )
            )
        ).all()
    for delivery_id, attempts in rows:
        await app.state.webhook_scheduler.schedule(delivery_id, attempts + 1, 0)
    return len(rows)
