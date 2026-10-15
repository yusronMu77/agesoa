"""Service app factory: health/readiness, Pub/Sub push endpoint, outbox sweep, probe event, operator event
stats, CORS, logging, tracing."""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator, Awaitable, Callable, Sequence
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from agesoa_platform.db import Database
from agesoa_platform.demo import require_demo_mode, reset_tables
from agesoa_platform.events import isoformat, new_event, utc_now
from agesoa_platform.inbox import EventHandler
from agesoa_platform.observability import (
    instrument_app,
    name_server_span,
    setup_logging,
    setup_tracing,
    shutdown_tracing,
)
from agesoa_platform.oidc import require_internal_caller
from agesoa_platform.ops import Operator as OperatorDep
from agesoa_platform.ops import ops_router
from agesoa_platform.outbox import OutboxDispatcher, Publisher, add_event
from agesoa_platform.pubsub import PubSubPublisher
from agesoa_platform.push import event_router
from agesoa_platform.settings import ServiceSettings

log = logging.getLogger(__name__)
Hook = Callable[[FastAPI], Awaitable[None]]


class Health(BaseModel):
    service: str
    status: Literal["ok"]
    release: str
    environment: str
    demo_mode: bool


class DatabaseStatus(BaseModel):
    ok: bool
    name: str | None = None
    user: str | None = None
    error: str | None = None


class Readiness(BaseModel):
    service: str
    status: Literal["ready", "not_ready"]
    release: str
    environment: str
    demo_mode: bool
    database: DatabaseStatus
    outbox_pending: int | None = None
    details: dict[str, Any] = {}


class SweepResult(BaseModel):
    published: int
    failed: int


class ResetResult(BaseModel):
    tables: list[str]


class ProbeResult(BaseModel):
    event_id: str
    decision_id: str
    published: int


def create_app(
    *,
    settings: ServiceSettings,
    title: str,
    description: str,
    version: str,
    routers: Sequence[APIRouter] = (),
    event_handlers: dict[str, EventHandler] | None = None,
    on_startup: Hook | None = None,
    on_demo_reset: Hook | None = None,
    readiness_details: Callable[[FastAPI], dict[str, Any]] | None = None,
    publisher: Publisher | None = None,
) -> FastAPI:
    setup_logging(settings)
    setup_tracing(settings)
    service = settings.service_name

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.db = Database(settings)
        app.state.outbox = OutboxDispatcher(
            app.state.db,
            publisher or PubSubPublisher(settings.google_cloud_project, settings.pubsub_emulator_host),
        )
        if on_startup:
            await on_startup(app)
        log.info(
            "service started",
            extra={
                "service_name": service,
                "detail": {"environment": settings.environment, "demo_mode": settings.demo_mode},
            },
        )
        try:
            yield
        finally:
            await app.state.db.dispose()
            shutdown_tracing()

    app = FastAPI(
        title=title,
        description=description,
        version=version,
        lifespan=lifespan,
        dependencies=[Depends(name_server_span)],
    )
    app.state.settings = settings
    if settings.cors_origin_list:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origin_list,
            allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type"],
            max_age=3600,
        )

    @app.get("/healthz", tags=["ops"], summary="Liveness (no dependencies)")
    async def healthz() -> Health:
        return Health(
            service=service,
            status="ok",
            release=settings.release,
            environment=settings.environment,
            demo_mode=settings.demo_mode,
        )

    @app.get(
        "/readyz",
        tags=["ops"],
        summary="Readiness: own database reachable",
        responses={503: {"model": Readiness, "description": "A dependency is down"}},
    )
    async def readyz(request: Request) -> Readiness:
        try:
            db = DatabaseStatus(**await request.app.state.db.check())
            pending = await request.app.state.outbox.pending()
        except Exception as exc:
            log.exception("readiness check failed")
            db, pending = DatabaseStatus(ok=False, error=type(exc).__name__), None
        body = Readiness(
            service=service,
            status="ready" if db.ok else "not_ready",
            release=settings.release,
            environment=settings.environment,
            demo_mode=settings.demo_mode,
            database=db,
            outbox_pending=pending,
            details=readiness_details(request.app) if readiness_details else {},
        )
        if not db.ok:
            return JSONResponse(body.model_dump(), status_code=503)  # type: ignore[return-value]
        return body

    internal = APIRouter(
        prefix="/internal", tags=["internal"], dependencies=[Depends(require_internal_caller)]
    )
    ops = ops_router(service)

    @internal.post(
        "/outbox/sweep", summary="Publish outbox events left behind (Cloud Scheduler, every minute)"
    )
    async def sweep(request: Request) -> SweepResult:
        return SweepResult(**await request.app.state.outbox.dispatch())

    @internal.post(
        "/demo/reset",
        summary="Empty this service's database and seed its demo data again (demo_mode only)",
        dependencies=[Depends(require_demo_mode)],
        responses={404: {"description": "Not found (also returned when demo_mode is off)"}},
    )
    async def demo_reset(request: Request) -> ResetResult:
        return await _reset(request.app, by="internal")

    async def _reset(app: FastAPI, by: str) -> ResetResult:
        tables = await reset_tables(app.state.db)
        if on_demo_reset:
            await on_demo_reset(app)
        log.warning("demo reset", extra={"detail": {"tables": len(tables), "by": by}})
        return ResetResult(tables=tables)

    # The same reset for an operator signed in to the portal (SCR-090), not only for the ops service account.
    @ops.post(
        "/demo-reset",
        summary="Operator: empty this service's database and seed its demo data again (demo_mode only)",
        dependencies=[Depends(require_demo_mode)],
        responses={404: {"description": "Not found (also returned when demo_mode is off)"}},
    )
    async def operator_demo_reset(request: Request, _: OperatorDep) -> ResetResult:
        return await _reset(request.app, by="operator")

    @internal.post(
        "/probe",
        summary="Record a system probe decision through the outbox (end-to-end event path check)",
    )
    async def probe(request: Request) -> ProbeResult:
        now = utc_now()
        decision_id = f"PROBE-{now:%Y%m%d%H%M%S%f}"
        event = new_event(
            "keputusan.dicatat",
            source=service,
            subject=decision_id,
            data={
                "decision_id": decision_id,
                "actor": {"kind": "system", "name": "probe", "service": service},
                "action": "system.probe",
                "subject": {"kind": "probe", "id": decision_id},
                "reason": "Operator probe of the event path: outbox, Pub/Sub, push, inbox, BigQuery.",
                "evidence_refs": [],
                "status_label": None,
                "occurred_at": isoformat(now),
                "synthetic": True,
            },
        )
        async with request.app.state.db.transaction() as session:
            await add_event(session, event)
        result = await request.app.state.outbox.dispatch()
        return ProbeResult(event_id=event["id"], decision_id=decision_id, published=result["published"])

    app.include_router(internal)
    app.include_router(ops)
    if event_handlers is not None:
        app.include_router(event_router(service, event_handlers))
    for router in routers:
        app.include_router(router)
    instrument_app(app)
    _document_body_errors(app)
    return app


def _document_body_errors(app: FastAPI) -> None:
    """FastAPI answers 400 when a request body cannot be parsed (not JSON, not UTF-8); say so in the contract."""
    generate = app.openapi

    def openapi() -> dict[str, Any]:
        if app.openapi_schema:
            return app.openapi_schema
        schema = generate()
        for operations in schema.get("paths", {}).values():
            for operation in operations.values():
                if isinstance(operation, dict) and "requestBody" in operation:
                    operation["responses"].setdefault(
                        "400", {"description": "Malformed request body (not valid JSON)"}
                    )
        return schema

    app.openapi = openapi  # type: ignore[method-assign]


async def flush_outbox(request: Request) -> None:
    """Call after the unit of work committed: publish now; the sweep retries anything that fails."""
    try:
        await request.app.state.outbox.dispatch()
    except Exception:
        log.exception("outbox flush failed; the sweep will retry")


def export_openapi(app: FastAPI, path: Path) -> None:
    spec = app.openapi()
    path.write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
