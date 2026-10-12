from agesoa_packs import load_packs, load_scenarios
from agesoa_platform.app import create_app
from fastapi import FastAPI

from agesoa_ingestion import __version__, demo
from agesoa_ingestion.api import router
from agesoa_ingestion.events import HANDLERS
from agesoa_ingestion.settings import Settings, get_settings

DESCRIPTION = "Citizen reports (drafts, corrections, media, privacy guard) and public signals; agents Intake and Signal."


def build_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = create_app(
        settings=settings,
        title="AGESOA ingestion",
        description=DESCRIPTION,
        version=__version__,
        routers=[router, demo.router],
        event_handlers=HANDLERS,
        readiness_details=lambda a: {"domain_packs": {p.id: p.version for p in a.state.packs.values()}},
    )
    # Fail fast: a broken domain pack stops the service from starting instead of producing wrong results.
    app.state.packs = load_packs(settings.domain_packs_dir)
    # Validated at startup like the packs; served only behind demo_mode.
    app.state.scenarios = {s.id: s for p in app.state.packs.values() for s in load_scenarios(p).values()}
    return app


def __getattr__(name: str) -> FastAPI:
    # `uvicorn agesoa_ingestion.main:app` builds the app lazily, so importing this module needs no environment.
    if name == "app":
        globals()["app"] = application = build_app()
        return application
    raise AttributeError(name)
