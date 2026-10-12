from agesoa_platform.app import create_app
from fastapi import FastAPI

from agesoa_case_audit import __version__
from agesoa_case_audit.api import router
from agesoa_case_audit.events import HANDLERS
from agesoa_case_audit.settings import Settings, get_settings

DESCRIPTION = "Cases, evidence deadlines, witness interviews, audit trail and findings; agent Audit."


def build_app(settings: Settings | None = None) -> FastAPI:
    return create_app(
        settings=settings or get_settings(),
        title="AGESOA case-audit",
        description=DESCRIPTION,
        version=__version__,
        routers=[router],
        event_handlers=HANDLERS,
    )


def __getattr__(name: str) -> FastAPI:
    # `uvicorn agesoa_case_audit.main:app` builds the app lazily, so importing this module needs no environment.
    if name == "app":
        globals()["app"] = application = build_app()
        return application
    raise AttributeError(name)
