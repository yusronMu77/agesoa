import asyncio
import logging

from agesoa_packs import load_packs
from agesoa_platform.app import create_app
from fastapi import FastAPI

from agesoa_trust import __version__, organizations, validators
from agesoa_trust.api import router
from agesoa_trust.demo import seed_demo_accounts, seed_demo_validators
from agesoa_trust.events import HANDLERS
from agesoa_trust.identity import IdentityAdmin
from agesoa_trust.role_agent import RoleAgent
from agesoa_trust.settings import Settings, get_settings

DESCRIPTION = "Organizations, validators, staff confirmation, validation routing and quorum; agent Role."
log = logging.getLogger(__name__)


def build_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    async def seed_demo(app: FastAPI) -> None:
        if settings.demo_mode:
            count = await seed_demo_validators(app.state.db)
            log.info("demo validators seeded", extra={"detail": {"validators": count}})
            if settings.environment != "test":
                # Seeded organizations (organisasi.terverifikasi) go out now, in the background: startup never
                # waits on Pub/Sub (the sweep retries a failure). Tests publish through their own recorder.
                app.state.seed_dispatch = asyncio.create_task(app.state.outbox.dispatch())
            password = settings.demo_validator_password
            if app.state.identity and password:
                try:
                    accounts = await seed_demo_accounts(app.state.identity, password.get_secret_value())
                    log.info("demo validator accounts ready", extra={"detail": {"accounts": accounts}})
                except Exception:  # the emulator may start after trust; sign-in waits for the next restart
                    log.exception("demo validator accounts not created")

    app = create_app(
        settings=settings,
        title="AGESOA trust",
        description=DESCRIPTION,
        version=__version__,
        routers=[router, validators.router, organizations.router],
        event_handlers=HANDLERS,
        on_startup=seed_demo,
        on_demo_reset=seed_demo,
    )
    # Validator role labels for the decision log come from the domain packs (fail fast on a broken pack).
    app.state.packs = load_packs(settings.domain_packs_dir)
    model = settings.effective_role_model
    app.state.role_agent = (
        RoleAgent.rules() if model == "rules" else RoleAgent([model, *settings.role_fallback_models])
    )
    # Role claims: the Auth emulator locally, Identity Platform (service account) elsewhere.
    app.state.identity = (
        IdentityAdmin(settings) if settings.firebase_auth_emulator_host or not settings.is_local else None
    )
    return app


def __getattr__(name: str) -> FastAPI:
    # `uvicorn agesoa_trust.main:app` builds the app lazily, so importing this module needs no environment.
    if name == "app":
        globals()["app"] = application = build_app()
        return application
    raise AttributeError(name)
