from functools import cache
from pathlib import Path

from agesoa_platform.settings import ServiceSettings
from pydantic import Field

from agesoa_delivery import SERVICE

# <repo>/domain-packs, both in a checkout and in the image (/app keeps the repository layout).
REPO_DOMAIN_PACKS = Path(__file__).resolve().parents[4] / "domain-packs"


class Settings(ServiceSettings):
    service_name: str = SERVICE
    domain_packs_dir: Path = REPO_DOMAIN_PACKS
    gemini_model: str = "gemini-3.8-flash"
    region: str = "asia-southeast2"
    portal_url: str = Field(
        "http://localhost:3000", description="Public portal base URL (case links in webhook bodies)."
    )
    webhook_retry_delays: str = Field(
        "30,120,600", description="Seconds before each retry of a failed webhook (contract: 3 retries)."
    )
    webhook_timeout: float = 10.0
    webhook_queue: str | None = Field(
        None,
        description="Cloud Tasks queue (projects/<p>/locations/<r>/queues/<q>) that runs webhook attempts; "
        "unset = in-process scheduler (devenv, tests).",
    )
    self_url: str | None = Field(None, description="This service's public URL (Cloud Tasks call it back).")
    tasks_invoker_email: str | None = Field(
        None,
        description="Service account Cloud Tasks signs its OIDC token with (allow-listed as internal caller).",
    )

    @property
    def retry_delays(self) -> list[float]:
        return [float(v) for v in self.webhook_retry_delays.split(",") if v.strip()]


@cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # DATABASE_URL comes from the environment
