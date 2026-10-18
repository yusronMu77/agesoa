"""Decision-log entries (`decision.recorded`) written by case-audit. The decision id is a hash of the case and a
caller-supplied key, so a redelivered or recomputed decision keeps the same id and the log writer stays idempotent."""

import hashlib
from datetime import datetime
from typing import Any

from agesoa_platform.events import isoformat, new_event

from agesoa_case_audit import SERVICE


def decision_event(
    case_id: str,
    key: str,
    *,
    action: str,
    rule: str,
    reason: str,
    refs: list[str],
    at: datetime,
    synthetic: bool,
    status_label: str | None = None,
) -> dict[str, Any]:
    decision_id = "CD-" + hashlib.sha256(f"{case_id}|{key}|{action}".encode()).hexdigest()[:24]
    return new_event(
        "decision.recorded",
        source=SERVICE,
        subject=decision_id,
        data={
            "decision_id": decision_id,
            "actor": {"kind": "rule", "name": rule, "service": SERVICE},
            "action": action,
            "subject": {"kind": "case", "id": case_id},
            "reason": reason,
            "evidence_refs": refs,
            "status_label": status_label,
            "occurred_at": isoformat(at),
            "synthetic": synthetic,
        },
    )
