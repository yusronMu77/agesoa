from functools import cache
from pathlib import Path

from agesoa_platform.settings import ServiceSettings

from agesoa_ingestion import SERVICE

# <repo>/domain-packs, both in a checkout and in the image (/app keeps the repository layout).
REPO_DOMAIN_PACKS = Path(__file__).resolve().parents[4] / "domain-packs"


class Settings(ServiceSettings):
    service_name: str = SERVICE
    domain_packs_dir: Path = REPO_DOMAIN_PACKS
    gemini_model: str = "gemini-3.8-flash"


@cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # DATABASE_URL comes from the environment
