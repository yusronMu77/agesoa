from agesoa_platform.app import create_app
from fastapi import FastAPI

from agesoa_trust import __version__
from agesoa_trust.api import router
from agesoa_trust.events import HANDLERS
from agesoa_trust.settings import Settings, get_settings

DESCRIPTION = "Organizations, validators, staff confirmation, validation routing and quorum; agent Role."


def build_app(settings: Settings | None = None) -> FastAPI:
    return create_app(
        settings=settings or get_settings(),
        title="AGESOA trust",
        description=DESCRIPTION,
        version=__version__,
        routers=[router],
        event_handlers=HANDLERS,
    )


def __getattr__(name: str) -> FastAPI:
    # `uvicorn agesoa_trust.main:app` builds the app lazily, so importing this module needs no environment.
    if name == "app":
        globals()["app"] = application = build_app()
        return application
    raise AttributeError(name)
