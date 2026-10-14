import asyncio
import logging

from agesoa_packs import load_packs, load_scenarios
from agesoa_platform.app import create_app
from fastapi import FastAPI

from agesoa_ingestion import __version__, demo, regions, reports
from agesoa_ingestion.api import router
from agesoa_ingestion.events import HANDLERS
from agesoa_ingestion.intake import IntakeAgent
from agesoa_ingestion.settings import Settings, get_settings
from agesoa_ingestion.storage import media_store

DESCRIPTION = "Citizen reports (drafts, corrections, media, privacy guard) and public signals; agents Intake and Signal."
log = logging.getLogger(__name__)


async def _load_demo_regions(app: FastAPI) -> None:
    """The fictional regency of the demo scenarios is demo data: loaded only when demo_mode is on."""
    if not app.state.settings.demo_mode:
        return
    async with app.state.db.transaction() as session:
        changed = await regions.load(session, regions.load_file(regions.DEMO_REGIONS), synthetic=True)
    if changed:
        # Publish in the background: startup never waits for Pub/Sub; the outbox sweep retries what fails.
        app.state.region_publish = asyncio.get_running_loop().create_task(_publish_quietly(app))
    log.info("demo districts loaded", extra={"detail": {"new_or_changed": changed}})


async def _publish_quietly(app: FastAPI) -> None:
    try:
        await asyncio.wait_for(app.state.outbox.dispatch(), timeout=30)
    except Exception:
        log.warning("publishing district boundaries deferred to the outbox sweep", exc_info=True)


def build_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = create_app(
        settings=settings,
        title="AGESOA ingestion",
        description=DESCRIPTION,
        version=__version__,
        routers=[router, reports.router, demo.router, regions.internal_router],
        event_handlers=HANDLERS,
        on_startup=_load_demo_regions,
        readiness_details=lambda a: {
            "domain_packs": {p.id: p.version for p in a.state.packs.values()},
            "intake_model": settings.intake_model,
        },
    )
    # Fail fast: a broken domain pack stops the service from starting instead of producing wrong results.
    app.state.packs = load_packs(settings.domain_packs_dir)
    # Validated at startup like the packs; served only behind demo_mode.
    app.state.scenarios = {s.id: s for p in app.state.packs.values() for s in load_scenarios(p).values()}
    app.state.media = media_store(settings.media_bucket, settings.media_dir)
    app.state.intake = {
        pack.id: IntakeAgent.rules(pack)
        if settings.intake_model == "rules"
        else IntakeAgent(pack, settings.intake_model)
        for pack in app.state.packs.values()
    }
    return app


def __getattr__(name: str) -> FastAPI:
    # `uvicorn agesoa_ingestion.main:app` builds the app lazily, so importing this module needs no environment.
    if name == "app":
        globals()["app"] = application = build_app()
        return application
    raise AttributeError(name)
