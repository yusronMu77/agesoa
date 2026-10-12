"""Service configuration from environment variables (Secret Manager values arrive as env vars on Cloud Run)."""

from __future__ import annotations

from functools import cached_property
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["local", "test", "demo", "staging", "prod"]
# Environments where local-only relaxations (unsigned push, dev tokens) are allowed.
LOCAL_ENVIRONMENTS = ("local", "test")


class ServiceSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    service_name: str
    environment: Environment = "local"
    # Demo fallbacks (fictional data, scripted interviews, seeded validators). Off unless set; refused in prod.
    demo_mode: bool = False
    release: str = Field("dev", description="Commit SHA of the running build.")

    database_url: str = Field(
        ..., description="postgresql+asyncpg://user:pass@host/db (Cloud SQL: ?host=/cloudsql/...)"
    )
    db_pool_size: int = 2
    db_max_overflow: int = 2
    db_search_path: str | None = Field(
        None, description="Postgres search_path override (isolated test schemas)."
    )

    google_cloud_project: str = "agesoa-local"
    pubsub_emulator_host: str | None = Field(
        None, description="host:port of the Pub/Sub emulator (local only)."
    )
    # Expected `aud` of Google-signed OIDC tokens on /events/* and /internal/* (set by infra, e.g. agesoa-demo-trust).
    oidc_audience: str = ""
    push_invoker_emails: str = Field(
        "", description="Comma-separated service accounts allowed to push events."
    )
    internal_invoker_emails: str = Field(
        "", description="Comma-separated service accounts allowed on /internal/*."
    )

    cors_origins: str = ""
    log_level: str = "INFO"
    trace_sample_ratio: float = 1.0

    @model_validator(mode="after")
    def _guard_production(self) -> ServiceSettings:
        if self.environment == "prod" and self.demo_mode:
            raise ValueError("demo_mode cannot be enabled in the prod environment")
        if self.environment not in LOCAL_ENVIRONMENTS and not self.oidc_audience:
            raise ValueError(f"OIDC_AUDIENCE is required in the {self.environment} environment")
        if self.environment not in LOCAL_ENVIRONMENTS and self.pubsub_emulator_host:
            raise ValueError(f"PUBSUB_EMULATOR_HOST must not be set in the {self.environment} environment")
        return self

    @property
    def is_local(self) -> bool:
        return self.environment in LOCAL_ENVIRONMENTS

    @cached_property
    def push_invokers(self) -> frozenset[str]:
        return _split(self.push_invoker_emails)

    @cached_property
    def internal_invokers(self) -> frozenset[str]:
        return _split(self.internal_invoker_emails)

    @cached_property
    def cors_origin_list(self) -> list[str]:
        return sorted(_split(self.cors_origins))


def _split(value: str) -> frozenset[str]:
    return frozenset(v.strip() for v in value.split(",") if v.strip())
