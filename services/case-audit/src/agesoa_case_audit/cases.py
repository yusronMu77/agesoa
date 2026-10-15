"""Case rules as code: which reports and signals belong together, and the evidence deadline of a case.

Pure functions, no I/O. The domain pack only supplies parameters (anchor field, hours, status cap); nothing here
knows what a domain is about. Tests: tests/test_cases.py.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Any, Literal

from agesoa_packs import DomainPack, EvidenceStatus, evidence_anchor, parse_datetime
from agesoa_packs.engine import DEFAULT_TZ

# Reports about the same category in the same regency belong to one case when the incidents happened within this
# window of each other (the case's earliest incident is the reference, so a case does not grow without bound).
MATCH_WINDOW = timedelta(days=7)

STATUS_ORDER = {"alleged": 0, "supported": 1, "proven": 2}
OPEN_STATUSES = ("open", "investigating", "awaiting_validation")


@dataclass(frozen=True)
class Source:
    """A report or a signal reduced to what case grouping needs."""

    kind: Literal["report", "signal"]
    id: str
    domain: str
    category: str
    region: dict[str, Any] | None
    occurred_at: datetime  # when the incident happened (UTC)
    deadline_at: datetime | None  # when physical evidence is presumed gone (UTC), None when unknown
    synthetic: bool

    def snapshot(self, data: dict[str, Any]) -> dict[str, Any]:
        """What case-audit keeps of the source: the event data without the pseudonymous reporter id."""
        kept = {k: v for k, v in data.items() if k != "reporter_ref"}
        return {
            "occurred_at": _iso(self.occurred_at),
            "deadline_at": _iso(self.deadline_at) if self.deadline_at else None,
            "data": kept,
        }


@dataclass(frozen=True)
class OpenCase:
    id: str
    domain: str
    category: str
    region: dict[str, Any] | None
    occurred_at: datetime
    status: str
    synthetic: bool


def source_from_report(pack: DomainPack, data: dict[str, Any]) -> Source:
    received_at = parse_datetime(data["received_at"])
    anchor = evidence_anchor(pack, data["fields"])
    return Source(
        kind="report",
        id=data["report_id"],
        domain=data["domain"],
        category=data["category"],
        region=data["region"],
        occurred_at=(anchor or received_at).astimezone(UTC),
        deadline_at=_deadline(pack, anchor),
        synthetic=data["synthetic"],
    )


def source_from_signal(pack: DomainPack, data: dict[str, Any]) -> Source:
    """A signal only knows the day of the incident, which is what the pack's fallback anchor field stands for."""
    day = date.fromisoformat(data["occurred_on"])
    anchor = datetime.combine(day, time(0, 0), tzinfo=DEFAULT_TZ)
    return Source(
        kind="signal",
        id=data["signal_id"],
        domain=data["domain"],
        category=data["category"],
        region=data["region"],
        occurred_at=anchor.astimezone(UTC),
        deadline_at=_deadline(pack, anchor),
        synthetic=data["synthetic"],
    )


def _deadline(pack: DomainPack, anchor: datetime | None) -> datetime | None:
    if anchor is None:
        return None
    return (anchor + timedelta(hours=pack.evidence_deadline["hours"])).astimezone(UTC)


def regency_key(region: dict[str, Any] | None) -> str | None:
    """Regency identity for matching: the official code when known, else the normalised name."""
    if not region:
        return None
    if region.get("regency_code"):
        return f"code:{region['regency_code']}"
    name = (region.get("regency_name") or "").strip().lower()
    return f"name:{name}" if name else None


def matches(case: OpenCase, source: Source) -> bool:
    """Decision table: a source joins a case only when domain, category and regency all agree (an unknown
    regency never matches) and the incidents are at most MATCH_WINDOW apart."""
    key = regency_key(source.region)
    return (
        case.domain == source.domain
        and case.category == source.category
        and key is not None
        and key == regency_key(case.region)
        and abs(source.occurred_at - case.occurred_at) <= MATCH_WINDOW
    )


def pick_case(candidates: list[OpenCase], source: Source) -> OpenCase | None:
    """The matching case closest in time to the source (oldest id breaks a tie), or None to open a new one."""
    fits = [c for c in candidates if c.status in OPEN_STATUSES and matches(c, source)]
    return min(fits, key=lambda c: (abs(source.occurred_at - c.occurred_at), c.id), default=None)


def new_case_id(source: Source) -> str:
    """Deterministic from the source that opened the case, so a replayed event cannot open a second case."""
    return "CASE-" + hashlib.sha256(f"{source.kind}:{source.id}".encode()).hexdigest()[:12]


def case_evidence(pack: DomainPack, deadlines: list[datetime | None], at: datetime) -> EvidenceStatus:
    """Evidence status of a case at time `at`. The earliest known deadline governs: once the first incident's
    window has closed, a later report does not bring the physical evidence back. Findings are capped by
    `max_finding_status`; with no deadline known the status is "unknown" and nothing caps the finding."""
    known = [d for d in deadlines if d is not None]
    if not known:
        return EvidenceStatus("unknown", None, "proven")
    deadline = min(known)
    if at <= deadline:
        return EvidenceStatus("available", deadline, "proven")
    return EvidenceStatus("likely_lost", deadline, pack.evidence_deadline["after_deadline_max_status"])


def cap_status(requested: str, maximum: str) -> str:
    """A finding never carries a stronger status than the case's evidence allows."""
    return requested if STATUS_ORDER[requested] <= STATUS_ORDER[maximum] else maximum


def _iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")
