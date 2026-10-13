"""Validation quorum: a rule as code (no prompt, no model).

A finding becomes final only through human validators:

- **approved** when at least two approvals come from different organizations and at least one approval is
  from a high-tier validator. A validator without an organization counts as an independent party of their
  own, so a high-tier newsroom validator plus an independent expert is a quorum.
- **rejected** as soon as one counted validator rejects: the finding goes back to the audit as an allegation.
- otherwise **pending**.

Decisions with a declared conflict of interest, or from validators that are not active (or on probation), are
recorded but never counted.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Literal

Outcome = Literal["approved", "rejected", "pending"]
COUNTED_STATUSES = frozenset({"active", "probation"})
MIN_ORGANIZATIONS = 2


@dataclass(frozen=True)
class Vote:
    validator_id: str
    organization_id: str | None
    tier: str | None  # high | medium
    status: str  # validator status at decision time
    decision: str  # approve | reject
    conflict: bool = False

    @property
    def counted(self) -> bool:
        return not self.conflict and self.status in COUNTED_STATUSES and self.tier in ("high", "medium")

    @property
    def party(self) -> str:
        return self.organization_id or f"independent:{self.validator_id}"


@dataclass(frozen=True)
class QuorumResult:
    outcome: Outcome
    reason: str


def evaluate(votes: Iterable[Vote]) -> QuorumResult:
    counted = [v for v in votes if v.counted]
    rejects = [v for v in counted if v.decision == "reject"]
    if rejects:
        return QuorumResult(
            "rejected", f"{len(rejects)} validator(s) rejected the finding; it returns to the audit."
        )
    approvals = [v for v in counted if v.decision == "approve"]
    parties = {v.party for v in approvals}
    has_high = any(v.tier == "high" for v in approvals)
    if len(parties) >= MIN_ORGANIZATIONS and has_high:
        return QuorumResult(
            "approved",
            f"{len(approvals)} approvals from {len(parties)} different organizations, at least one high tier.",
        )
    missing = []
    if len(parties) < MIN_ORGANIZATIONS:
        missing.append(f"approvals from {MIN_ORGANIZATIONS} different organizations ({len(parties)} so far)")
    if not has_high:
        missing.append("an approval from a high-tier validator")
    return QuorumResult("pending", "Waiting for " + " and ".join(missing) + ".")
