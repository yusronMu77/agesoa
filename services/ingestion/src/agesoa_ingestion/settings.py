from functools import cache
from pathlib import Path

from agesoa_platform.settings import ServiceSettings
from pydantic import Field, model_validator

from agesoa_ingestion import SERVICE

# <repo>/domain-packs, both in a checkout and in the image (/app keeps the repository layout).
REPO_DOMAIN_PACKS = Path(__file__).resolve().parents[4] / "domain-packs"
LOCAL_MEDIA_DIR = Path(__file__).resolve().parents[2] / ".media"


class Settings(ServiceSettings):
    service_name: str = SERVICE
    domain_packs_dir: Path = REPO_DOMAIN_PACKS
    gemini_model: str = "gemini-3.8-flash"
    intake_model: str = Field(
        "rules",
        description="Model of Agen Intake: a Gemini model id, or `rules` (rule-based fallback, local or demo_mode).",
    )
    intake_timeout_seconds: float = Field(
        20,
        gt=0,
        description="Seconds Agen Intake gives the model per attempt. With `intake_attempts` it must stay under the "
        "60 s request limit of the service; when it runs out the reporter fills the draft by hand.",
    )
    intake_attempts: int = Field(
        2, ge=1, description="Model calls per Intake (one retry on a timeout or 429/5xx)."
    )
    media_bucket: str | None = Field(None, description="GCS bucket for evidence; unset = local folder.")
    media_dir: Path = LOCAL_MEDIA_DIR

    @model_validator(mode="after")
    def _guard_fallbacks(self) -> "Settings":
        if not self.is_local and not self.media_bucket:
            raise ValueError(f"MEDIA_BUCKET is required in the {self.environment} environment")
        if self.intake_model == "rules" and not (self.is_local or self.demo_mode):
            raise ValueError("INTAKE_MODEL=rules is a fallback for local runs and demo_mode only")
        return self


@cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # DATABASE_URL comes from the environment
