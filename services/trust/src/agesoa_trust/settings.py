from functools import cache
from pathlib import Path

from agesoa_platform.settings import ServiceSettings
from pydantic import Field, SecretStr

from agesoa_trust import SERVICE

# <repo>/domain-packs, both in a checkout and in the image (/app keeps the repository layout).
REPO_DOMAIN_PACKS = Path(__file__).resolve().parents[4] / "domain-packs"


class Settings(ServiceSettings):
    service_name: str = SERVICE
    domain_packs_dir: Path = REPO_DOMAIN_PACKS
    gemini_model: str = "gemini-3.8-flash"
    demo_validator_password: SecretStr | None = Field(
        None,
        description="demo_mode + Firebase Auth emulator only: password of the seeded demo validator accounts.",
    )


@cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # DATABASE_URL comes from the environment
