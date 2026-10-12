from functools import cache

from agesoa_platform.settings import ServiceSettings

from agesoa_transparency import SERVICE


class Settings(ServiceSettings):
    service_name: str = SERVICE


@cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # DATABASE_URL comes from the environment
