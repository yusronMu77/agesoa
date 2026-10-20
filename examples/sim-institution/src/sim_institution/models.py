"""Request bodies. The webhook body mirrors packages/contracts/webhook/audit-report-final.schema.json."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

EventType = Literal["audit_report.final", "test_event"]
FollowUpStatus = Literal["received", "in_progress", "done"]
FOLLOW_UP_STATUSES: tuple[FollowUpStatus, ...] = ("received", "in_progress", "done")
# Status presets of the SCR-081 select: a form value that sends an AGESOA status plus a short status detail
# (delivery StatusUpdate.detail, shown publicly as the institution's own statement).
STATUS_PRESETS: dict[str, tuple[FollowUpStatus, str]] = {
    "reinspection_scheduled": ("in_progress", "Pemeriksaan ulang dijadwalkan"),
}
DETAIL_MAX_LENGTH = 160


def normalize_detail(text: str | None) -> str | None:
    """One trimmed line (inner whitespace collapsed); blank means no detail."""
    line = " ".join((text or "").split())
    return line or None


def resolve_follow_up(choice: str, detail: str | None = None) -> tuple[FollowUpStatus, str | None]:
    """Map a select value (a status or a preset) and the optional typed detail to ``(status, detail)``.

    A typed detail wins over the preset's detail. Raises ``ValueError`` for an unknown value or a detail
    longer than ``DETAIL_MAX_LENGTH``.
    """
    if choice in STATUS_PRESETS:
        status, preset_detail = STATUS_PRESETS[choice]
    elif choice in FOLLOW_UP_STATUSES:
        status, preset_detail = choice, None  # type: ignore[assignment]
    else:
        raise ValueError(f"unknown follow-up status {choice!r}")
    final = normalize_detail(detail) or preset_detail
    if final is not None and len(final) > DETAIL_MAX_LENGTH:
        raise ValueError(f"status detail longer than {DETAIL_MAX_LENGTH} characters")
    return status, final


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
