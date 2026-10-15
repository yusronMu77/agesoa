import asyncio
import logging

import httpx
from agesoa_platform.app import create_app
from fastapi import FastAPI

from agesoa_delivery import __version__, institutions
from agesoa_delivery.api import router
from agesoa_delivery.events import HANDLERS
from agesoa_delivery.secrets_store import LocalSecretStore, SecretManagerStore
from agesoa_delivery.settings import Settings, get_settings
from agesoa_delivery.webhooks import CloudTasksScheduler, LocalScheduler, resume_pending

DESCRIPTION = "Audit reports, institution subscriptions with signed webhooks, status and right-of-reply API; agent Report."
log = logging.getLogger(__name__)


def build_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    async def resume_webhooks(app: FastAPI) -> None:
        if not isinstance(app.state.webhook_scheduler, LocalScheduler):
            return

        async def resume() -> None:
            try:
                resumed = await resume_pending(app)
            except Exception as exc:  # database not reachable yet: the next restart picks them up
                log.warning("pending webhooks not resumed", extra={"detail": {"error": type(exc).__name__}})
                return
            if resumed:
                log.info("pending webhooks resumed", extra={"detail": {"jobs": resumed}})

        app.state.webhook_resume = asyncio.create_task(resume())

    app = create_app(
        settings=settings,
        title="AGESOA delivery",
        description=DESCRIPTION,
        version=__version__,
        routers=[router, institutions.router, institutions.institution_api, institutions.internal],
        event_handlers=HANDLERS,
        on_startup=resume_webhooks,
    )
    # Outgoing webhooks: no redirects (the subscribed URL is the only target).
    app.state.webhook_client = httpx.AsyncClient(follow_redirects=False)
    if settings.is_local:
        app.state.secrets = LocalSecretStore(app)
    else:
        app.state.secrets = SecretManagerStore(settings.google_cloud_project, settings.region)
    if settings.webhook_queue and settings.self_url and settings.tasks_invoker_email:
        app.state.webhook_scheduler = CloudTasksScheduler(
            settings.webhook_queue,
            settings.self_url,
            settings.tasks_invoker_email,
            settings.oidc_audience,
            httpx.AsyncClient(timeout=10),
        )
    else:
        app.state.webhook_scheduler = LocalScheduler(app)
    return app


def __getattr__(name: str) -> FastAPI:
    # `uvicorn agesoa_delivery.main:app` builds the app lazily, so importing this module needs no environment.
    if name == "app":
        globals()["app"] = application = build_app()
        return application
    raise AttributeError(name)
