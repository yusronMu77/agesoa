from agesoa_platform.app import create_app
from fastapi import FastAPI

from agesoa_transparency import __version__
from agesoa_transparency.api import router
from agesoa_transparency.events import HANDLERS
from agesoa_transparency.settings import Settings, get_settings

DESCRIPTION = "Hash-chained public decision log (its only writer) and the public read models."


def build_app(settings: Settings | None = None) -> FastAPI:
    return create_app(
        settings=settings or get_settings(),
        title="AGESOA transparency",
        description=DESCRIPTION,
        version=__version__,
        routers=[router],
        event_handlers=HANDLERS,
    )


def __getattr__(name: str) -> FastAPI:
    # `uvicorn agesoa_transparency.main:app` builds the app lazily, so importing this module needs no environment.
    if name == "app":
        globals()["app"] = application = build_app()
        return application
    raise AttributeError(name)
