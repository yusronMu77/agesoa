from agesoa_platform.app import create_app
from fastapi import FastAPI

from agesoa_delivery import __version__
from agesoa_delivery.api import router
from agesoa_delivery.events import HANDLERS
from agesoa_delivery.settings import Settings, get_settings

DESCRIPTION = "Audit reports, institution subscriptions with signed webhooks, status and right-of-reply API; agent Report."


def build_app(settings: Settings | None = None) -> FastAPI:
    return create_app(
        settings=settings or get_settings(),
        title="AGESOA delivery",
        description=DESCRIPTION,
        version=__version__,
        routers=[router],
        event_handlers=HANDLERS,
    )


def __getattr__(name: str) -> FastAPI:
    # `uvicorn agesoa_delivery.main:app` builds the app lazily, so importing this module needs no environment.
    if name == "app":
        globals()["app"] = application = build_app()
        return application
    raise AttributeError(name)
