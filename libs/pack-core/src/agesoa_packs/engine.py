"""Generic evaluation of pack rules and the evidence deadline. Business rules live here as code + tests,
never in prompts; packs only provide parameters."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Any, Literal
from zoneinfo import ZoneInfo

from agesoa_packs.loader import DomainPack

DEFAULT_TZ = ZoneInfo("Asia/Jakarta")
FindingStatus = Literal["alleged", "supported", "proven"]


@dataclass(frozen=True)
class RuleResult:
    rule_id: str
    violated: bool | None  # None = not evaluable (a field is missing or inconsistent)
    detail: str

    def as_event(self) -> dict[str, Any]:
        return {"rule_id": self.rule_id, "violated": bool(self.violated), "detail": self.detail}


@dataclass(frozen=True)
class EvidenceStatus:
    status: Literal["available", "likely_lost", "unknown"]
    deadline_at: datetime | None
    max_finding_status: FindingStatus


def parse_datetime(value: Any) -> datetime:
    """ISO 8601 with an explicit offset. Naive values are rejected: the caller must resolve the time zone."""
    if isinstance(value, datetime):
        result = value
    elif isinstance(value, str):
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    else:
        raise ValueError(f"expected an ISO 8601 datetime, got {value!r}")
    if result.tzinfo is None:
        raise ValueError(f"datetime {value!r} has no time zone offset")
    return result


def evaluate_rules(pack: DomainPack, fields: dict[str, Any]) -> list[RuleResult]:
    return [_EVALUATORS[rule["kind"]](rule, fields) for rule in pack.rules]


def _max_interval(rule: dict[str, Any], fields: dict[str, Any]) -> RuleResult:
    p = rule["params"]
    missing = [f for f in (p["from_field"], p["to_field"]) if fields.get(f) is None]
    if missing:
        return RuleResult(rule["id"], None, f"not evaluated: missing {', '.join(missing)}")
    gap = parse_datetime(fields[p["to_field"]]) - parse_datetime(fields[p["from_field"]])
    if gap < timedelta(0):
        return RuleResult(rule["id"], None, f"not evaluated: {p['to_field']} is before {p['from_field']}")
    minutes = gap.total_seconds() / 60
    detail = f"{minutes:g} min between {p['from_field']} and {p['to_field']} (max {p['max_minutes']})"
    return RuleResult(rule["id"], gap > timedelta(minutes=p["max_minutes"]), detail)


_EVALUATORS = {"max_interval": _max_interval}


def evidence_status(
    pack: DomainPack, fields: dict[str, Any], received_at: datetime | str, tz: ZoneInfo = DEFAULT_TZ
) -> EvidenceStatus:
    """Physical evidence is assumed available until `hours` after the anchor, the deadline itself included."""
    cfg = pack.evidence_deadline
    if cfg is None:
        return EvidenceStatus("unknown", None, "proven")
    anchor = _anchor(fields, cfg, tz)
    if anchor is None:
        return EvidenceStatus("unknown", None, "proven")
    deadline = (anchor + timedelta(hours=cfg["hours"])).astimezone(UTC)
    if parse_datetime(received_at) <= deadline:
        return EvidenceStatus("available", deadline, "proven")
    return EvidenceStatus("likely_lost", deadline, cfg["after_deadline_max_status"])


def evidence_anchor(pack: DomainPack, fields: dict[str, Any], tz: ZoneInfo = DEFAULT_TZ) -> datetime | None:
    """When the incident happened as far as the evidence deadline is concerned (anchor field, else the fallback)."""
    return _anchor(fields, pack.evidence_deadline, tz) if pack.evidence_deadline is not None else None


def _anchor(fields: dict[str, Any], cfg: dict[str, Any], tz: ZoneInfo) -> datetime | None:
    if fields.get(cfg["anchor_field"]) is not None:
        return parse_datetime(fields[cfg["anchor_field"]])
    fallback = cfg.get("fallback_anchor_field")
    value = fields.get(fallback) if fallback else None
    if value is None:
        return None
    if isinstance(value, str) and "T" not in value:
        return datetime.combine(date.fromisoformat(value), time(0, 0), tzinfo=tz)
    return parse_datetime(value)
