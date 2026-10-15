"""Validator registration rules (business rules as code; decision table in tests/test_registration_rules.py).

The Role agent only reads the document (fields + confidence). Whether a candidate becomes a validator, and at which
tier, is decided here:

- an expired document is rejected (`expired`);
- with an organization: the document must come from that organization (`issuer_mismatch` otherwise), the
  organization must be a verified newsroom (an agency is a possibly audited party and never confirms validators:
  `audited_party`; an unverified organization counts as no organization), and the candidate waits for the
  organization to confirm them as staff (tier high after confirmation);
- without an organization (or with an unverified one): confidence at or above the threshold gives tier medium,
  below it the registration is rejected (`low_confidence`);
- every newly accepted validator starts on probation (counted in quorum, labelled as new).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal

Status = Literal["awaiting_confirmation", "probation", "rejected"]
Reason = Literal[
    "expired", "issuer_mismatch", "audited_party", "low_confidence", "unreadable", "not_confirmed"
]


@dataclass(frozen=True)
class Reading:
    """What the Role agent read from the document."""

    document_type: str
    issuer: str | None
    valid_until: date | None
    confidence: float


@dataclass(frozen=True)
class Organization:
    name: str
    kind: Literal["newsroom", "agency"]
    status: str


@dataclass(frozen=True)
class Outcome:
    status: Status
    path: Literal["self_declared", "org_confirmed"]
    tier: Literal["high", "medium"] | None
    reason: Reason | None = None


def _same_issuer(issuer: str | None, organization: str) -> bool:
    def norm(value: str) -> str:
        return " ".join(value.lower().replace("(fictional)", "").split())

    return bool(issuer) and norm(issuer) == norm(organization)


def decide(reading: Reading, organization: Organization | None, threshold: float, today: date) -> Outcome:
    if reading.document_type == "unreadable":
        return Outcome("rejected", "self_declared", None, "unreadable")
    if reading.valid_until is not None and reading.valid_until < today:
        return Outcome("rejected", "org_confirmed" if organization else "self_declared", None, "expired")
    if organization is not None:
        if organization.kind == "agency":
            return Outcome("rejected", "org_confirmed", None, "audited_party")
        if not _same_issuer(reading.issuer, organization.name):
            return Outcome("rejected", "org_confirmed", None, "issuer_mismatch")
        if organization.status == "verified":
            return Outcome("awaiting_confirmation", "org_confirmed", None)
        # An unverified organization does not vouch for anyone: treated as self-declared below.
    if reading.confidence >= threshold:
        return Outcome("probation", "self_declared", "medium")
    return Outcome("rejected", "self_declared", None, "low_confidence")


def after_confirmation(confirmed: bool) -> Outcome:
    """The verified newsroom confirmed (or refused) the candidate as its staff."""
    if confirmed:
        return Outcome("probation", "org_confirmed", "high")
    return Outcome("rejected", "org_confirmed", None, "not_confirmed")
