import logging

from agesoa_packs import load_packs
from agesoa_platform.app import create_app
from fastapi import FastAPI

from agesoa_trust import __version__
from agesoa_trust.api import router
from agesoa_trust.demo import seed_demo_accounts, seed_demo_validators
from agesoa_trust.events import HANDLERS
from agesoa_trust.identity import IdentityAdmin
from agesoa_trust.settings import Settings, get_settings

DESCRIPTION = "Organizations, validators, staff confirmation, validation routing and quorum; agent Role."
log = logging.getLogger(__name__)


def build_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    async def start(app: FastAPI) -> None:
        if settings.demo_mode:
            count = await seed_demo_validators(app.state.db)
            log.info("demo validators seeded", extra={"detail": {"validators": count}})
            password = settings.demo_validator_password
            if settings.firebase_auth_emulator_host and password:
                try:
                    accounts = await seed_demo_accounts(IdentityAdmin(settings), password.get_secret_value())
                    log.info("demo validator accounts ready", extra={"detail": {"accounts": accounts}})
                except Exception:  # the emulator may start after trust; sign-in waits for the next restart
                    log.exception("demo validator accounts not created")

    app = create_app(
        settings=settings,
        title="AGESOA trust",
        description=DESCRIPTION,
        version=__version__,
        routers=[router],
        event_handlers=HANDLERS,
        on_startup=start,
    )
    # Validator role labels for the decision log come from the domain packs (fail fast on a broken pack).
    app.state.packs = load_packs(settings.domain_packs_dir)
    return app


def __getattr__(name: str) -> FastAPI:
    # `uvicorn agesoa_trust.main:app` builds the app lazily, so importing this module needs no environment.
    if name == "app":
        globals()["app"] = application = build_app()
        return application
    raise AttributeError(name)
