from functools import cache
from pathlib import Path

from agesoa_platform.settings import ServiceSettings
from pydantic import Field, SecretStr, model_validator

from agesoa_trust import SERVICE

# <repo>/domain-packs, both in a checkout and in the image (/app keeps the repository layout).
REPO_DOMAIN_PACKS = Path(__file__).resolve().parents[4] / "domain-packs"


class Settings(ServiceSettings):
    service_name: str = SERVICE
    domain_packs_dir: Path = REPO_DOMAIN_PACKS
    gemini_model: str = "gemini-3.8-flash"
    role_model: str | None = Field(
        None,
        description="Model of Agen Peran: a Gemini model id, or `rules` (reads only the fictional demo documents; "
        "local runs and demo_mode). Unset: `rules` locally, `gemini_model` elsewhere.",
    )
    role_fallback_models: list[str] = Field(
        default_factory=lambda: ["gemini-3.1-flash-lite-preview"],
        description="Tried in order when the role model is overloaded (429/5xx).",
    )
    role_confidence_threshold: float = Field(
        0.6,
        ge=0,
        le=1,
        description="Minimum confidence of a self-declared validator's document (tier medium).",
    )
    dns_resolver: str | None = Field(
        None,
        description="host:port of the DNS server for organization domain checks; unset = system resolver. "
        "Locally the devenv test resolver (agesoa-dev-dns) answers for the fictional demo domains.",
    )
    demo_validator_password: SecretStr | None = Field(
        None,
        description="demo_mode + Firebase Auth emulator only: password of the seeded demo validator accounts.",
    )

    @property
    def effective_role_model(self) -> str:
        return self.role_model or ("rules" if self.is_local else self.gemini_model)

    @model_validator(mode="after")
    def _rules_only_for_local_or_demo(self) -> "Settings":
        if self.effective_role_model == "rules" and not (self.is_local or self.demo_mode):
            raise ValueError("ROLE_MODEL=rules is a fallback for local runs and demo_mode only")
        return self


@cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # DATABASE_URL comes from the environment
