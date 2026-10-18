"""Request bodies. The webhook body mirrors packages/contracts/webhook/audit-report-final.schema.json."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

EventType = Literal["audit_report.final", "test_event"]
FollowUpStatus = Literal["received", "in_progress", "done"]


class RootCause(BaseModel):
    model_config = ConfigDict(extra="forbid")

    statement: str
    status: Literal["alleged", "supported", "proven"]
    evidence: list[str]


class Case(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    domain: str
    category: str
    region: str
    summary: str
    root_causes: list[RootCause]
    recommendations: list[str]
    validations: list[str]
    url: str
    synthetic: bool


class WebhookBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event: EventType
    event_id: str = Field(min_length=1)
    case: Case
    parties_mentioned: list[str]


class SettingsUpdate(BaseModel):
    """Omitted or null fields stay unchanged; an empty string clears a value."""

    model_config = ConfigDict(extra="forbid")

    webhook_secret: str | None = None
    api_key: str | None = None
    agesoa_api_url: str | None = None
    fail_next: int | None = Field(default=None, ge=0)
