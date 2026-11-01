from functools import cache
from pathlib import Path
from typing import Literal

from agesoa_platform.settings import ServiceSettings
from pydantic import Field, model_validator

from agesoa_case_audit import SERVICE

# <repo>/domain-packs, both in a checkout and in the image (/app keeps the repository layout).
REPO_DOMAIN_PACKS = Path(__file__).resolve().parents[4] / "domain-packs"


class Settings(ServiceSettings):
    service_name: str = SERVICE
    # Event handlers hold a connection only while they record a source; the audit round that follows holds none while
    # the model answers. The pool is still larger than the others': ADK keeps its own sessions in the same engine.
    db_pool_size: int = 3
    db_max_overflow: int = 3
    audit_parallel_rounds: int = Field(
        4, ge=1, description="Audit rounds waiting on the model at once (Vertex AI quota; the rest queue)."
    )
    audit_timeout_seconds: float = Field(
        20,
        gt=0,
        description="Time limit of one model attempt of Agen Audit (the ranking; the pattern agent has 25).",
    )
    audit_attempts: int = Field(
        2, ge=1, description="Model attempts per call; the next only after a timeout or a 429/5xx."
    )
    domain_packs_dir: Path = REPO_DOMAIN_PACKS
    gemini_model: str = "gemini-3.8-flash"
    audit_model: str = Field(
        "rules",
        description="Model of Agen Audit: a Gemini model id, or `rules` (the lexical ranking written as a model "
        "response; local or demo_mode only).",
    )

    incident_store: Literal["database", "bigquery"] = Field(
        "database",
        description="Where pattern tests read the incidents of other cases: this service's own database, or the "
        "BigQuery event archive (with the database as the fallback when the archive cannot answer).",
    )
    bigquery_events_table: str | None = Field(
        None, description="project.dataset.table of the event archive; required for INCIDENT_STORE=bigquery."
    )

    @model_validator(mode="after")
    def _guard_store(self) -> "Settings":
        if self.incident_store == "bigquery" and not self.bigquery_events_table:
            raise ValueError("INCIDENT_STORE=bigquery needs BIGQUERY_EVENTS_TABLE (project.dataset.table)")
        return self

    @model_validator(mode="after")
    def _guard_fallbacks(self) -> "Settings":
        if self.audit_model == "rules" and not (self.is_local or self.demo_mode):
            raise ValueError("AUDIT_MODEL=rules is a fallback for local runs and demo_mode only")
        return self


@cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # DATABASE_URL comes from the environment
