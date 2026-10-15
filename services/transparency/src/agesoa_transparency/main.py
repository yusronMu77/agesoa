import os

from agesoa_platform.app import create_app
from fastapi import FastAPI

from agesoa_transparency import __version__
from agesoa_transparency.api import internal_router, router
from agesoa_transparency.demo import restart_log
from agesoa_transparency.events import HANDLERS
from agesoa_transparency.read_model import DocumentStore, FirestoreStore, Projector
from agesoa_transparency.settings import Settings, get_settings

DESCRIPTION = "Hash-chained public decision log (its only writer) and the public read models."


def build_app(settings: Settings | None = None, store: DocumentStore | None = None) -> FastAPI:
    settings = settings or get_settings()

    async def start_read_model(app: FastAPI) -> None:
        app.state.read_model = None
        if not settings.read_model_enabled:
            return
        if settings.firestore_emulator_host:
            os.environ["FIRESTORE_EMULATOR_HOST"] = settings.firestore_emulator_host
        projector = Projector(app.state.db, store or FirestoreStore(settings.google_cloud_project))
        projector.activate()
        app.state.read_model = projector

    return create_app(
        settings=settings,
        title="AGESOA transparency",
        description=DESCRIPTION,
        version=__version__,
        routers=[router, internal_router],
        event_handlers=HANDLERS,
        on_startup=start_read_model,
        on_demo_reset=restart_log,
        readiness_details=lambda a: {"read_model": a.state.read_model is not None},
    )


def __getattr__(name: str) -> FastAPI:
    # `uvicorn agesoa_transparency.main:app` builds the app lazily, so importing this module needs no environment.
    if name == "app":
        globals()["app"] = application = build_app()
        return application
    raise AttributeError(name)
