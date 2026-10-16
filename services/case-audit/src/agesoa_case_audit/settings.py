from functools import cache
from pathlib import Path

from agesoa_platform.settings import ServiceSettings
from pydantic import Field, model_validator

from agesoa_case_audit import SERVICE

# <repo>/domain-packs, both in a checkout and in the image (/app keeps the repository layout).
REPO_DOMAIN_PACKS = Path(__file__).resolve().parents[4] / "domain-packs"


class Settings(ServiceSettings):
    service_name: str = SERVICE
    domain_packs_dir: Path = REPO_DOMAIN_PACKS
    gemini_model: str = "gemini-3.8-flash"
    audit_model: str = Field(
        "rules",
        description="Model of Agen Audit: a Gemini model id, or `rules` (the lexical ranking written as a model "
        "response; local or demo_mode only).",
    )

    @model_validator(mode="after")
    def _guard_fallbacks(self) -> "Settings":
        if self.audit_model == "rules" and not (self.is_local or self.demo_mode):
            raise ValueError("AUDIT_MODEL=rules is a fallback for local runs and demo_mode only")
        return self


@cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # DATABASE_URL comes from the environment
