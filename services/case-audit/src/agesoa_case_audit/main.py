from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from agesoa_packs import load_packs
from agesoa_platform.app import create_app
from fastapi import FastAPI
from google.adk.sessions import DatabaseSessionService

from agesoa_case_audit import __version__
from agesoa_case_audit.agent import AuditAgent
from agesoa_case_audit.api import router
from agesoa_case_audit.bigquery_store import BigQueryIncidentStore
from agesoa_case_audit.events import build_handlers
from agesoa_case_audit.patterns import DatabaseIncidentStore, FallbackIncidentStore, IncidentStore
from agesoa_case_audit.settings import Settings, get_settings

DESCRIPTION = "Cases, evidence deadlines, witness interviews, audit trail and findings; agent Audit."


def build_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    packs = load_packs(settings.domain_packs_dir)  # fail fast on a broken pack, like the other services
    store: IncidentStore = DatabaseIncidentStore()
    if settings.incident_store == "bigquery":
        assert settings.bigquery_events_table  # checked by Settings
        store = FallbackIncidentStore(BigQueryIncidentStore(settings.bigquery_events_table), store)
    ranker = AuditAgent(settings.audit_model)
    app = create_app(
        settings=settings,
        title="AGESOA case-audit",
        description=DESCRIPTION,
        version=__version__,
        routers=[router],
        event_handlers=build_handlers(packs, store, ranker),
    )
    _keep_sessions_in_database(app, ranker)
    app.state.packs = packs
    app.state.incident_store = store
    app.state.ranker = ranker
    return app


def _keep_sessions_in_database(app: FastAPI, ranker: AuditAgent) -> None:
    """The ADK session of every case lives in this service's own database (tables `sessions`, `events`, ... created
    by ADK's `DatabaseSessionService` on first use). The engine only exists once the app has started."""
    started = app.router.lifespan_context

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        async with started(application):
            ranker.sessions = DatabaseSessionService(db_engine=application.state.db.engine)
            yield

    app.router.lifespan_context = lifespan


def __getattr__(name: str) -> FastAPI:
    # `uvicorn agesoa_case_audit.main:app` builds the app lazily, so importing this module needs no environment.
    if name == "app":
        globals()["app"] = application = build_app()
        return application
    raise AttributeError(name)
