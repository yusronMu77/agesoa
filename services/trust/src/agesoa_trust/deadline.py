"""Validation deadline ("Tenggat"): a rule as code, its only parameter comes from the domain pack.

`deadline_at = ready_at + validation.decision_window_hours` of the finding's domain pack, where `ready_at` is the
time of the `finding.ready_for_validation` event (when the finding became ready, not when trust happened to
receive it). A pack without the setting, or an unknown domain, gives no deadline (None): the core never promises a
fixed window of its own. The deadline is computed once, when the validation opens, so a later pack change never
moves the deadline of a request already in a validator's queue. A naive `ready_at` is rejected (the time zone
must be explicit, as everywhere in pack rules).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from agesoa_packs import DomainPack, parse_datetime


def decision_window_hours(pack: DomainPack | None) -> int | None:
    if pack is None:
        return None
    return (pack.document.get("validation") or {}).get("decision_window_hours")


def validation_deadline(pack: DomainPack | None, ready_at: datetime | str) -> datetime | None:
    start = parse_datetime(ready_at)  # raises ValueError on a naive value
    hours = decision_window_hours(pack)
    if hours is None:
        return None
    return (start + timedelta(hours=hours)).astimezone(UTC)


def deadline_sort_key(row: Any) -> tuple[bool, datetime, datetime]:
    """Nearest deadline first; requests without a deadline last, oldest first among equals."""
    deadline = row["deadline_at"]
    return (deadline is None, deadline or row["received_at"], row["received_at"])
