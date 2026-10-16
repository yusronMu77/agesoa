from agesoa_packs import load_packs
from agesoa_platform.app import create_app
from fastapi import FastAPI

from agesoa_case_audit import __version__
from agesoa_case_audit.api import router
from agesoa_case_audit.events import build_handlers
from agesoa_case_audit.patterns import DatabaseIncidentStore
from agesoa_case_audit.settings import Settings, get_settings

DESCRIPTION = "Cases, evidence deadlines, witness interviews, audit trail and findings; agent Audit."


def build_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    packs = load_packs(settings.domain_packs_dir)  # fail fast on a broken pack, like the other services
    store = DatabaseIncidentStore()
    app = create_app(
        settings=settings,
        title="AGESOA case-audit",
        description=DESCRIPTION,
        version=__version__,
        routers=[router],
        event_handlers=build_handlers(packs, store),
    )
    app.state.packs = packs
    app.state.incident_store = store
    return app


def __getattr__(name: str) -> FastAPI:
    # `uvicorn agesoa_case_audit.main:app` builds the app lazily, so importing this module needs no environment.
    if name == "app":
        globals()["app"] = application = build_app()
        return application
    raise AttributeError(name)
