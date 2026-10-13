from functools import cache

from agesoa_platform.settings import ServiceSettings
from pydantic import Field, model_validator

from agesoa_transparency import SERVICE


class Settings(ServiceSettings):
    service_name: str = SERVICE
    firestore_emulator_host: str | None = Field(
        None, description="host:port of the Firestore emulator (local only); read by the Firestore client."
    )
    read_model_enabled: bool = Field(True, description="Project consumed events to the Firestore read model.")

    @model_validator(mode="after")
    def _guard_emulator(self) -> "Settings":
        if not self.is_local and self.firestore_emulator_host:
            raise ValueError(f"FIRESTORE_EMULATOR_HOST must not be set in the {self.environment} environment")
        return self


@cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # DATABASE_URL comes from the environment
