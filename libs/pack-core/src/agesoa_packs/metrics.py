"""Cross-case pattern metrics: does the same cause show up in other incidents.

A pack names a metric (`pattern_metrics`) and the report fields it groups by; the kinds are fixed, parameterised
queries implemented and tested here, so an agent can only pick a metric and a window, never write a query. The
functions are pure: where the incidents come from (a database, BigQuery) is the caller's business.

Two incidents are "the same place" when they carry the same value of the group_by field (compared case-insensitively
without surrounding space). A pattern recurs when an incident of another case sits in the same group.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from agesoa_packs.engine import parse_datetime
from agesoa_packs.loader import DomainPack

MAX_WINDOW_DAYS = 365


@dataclass(frozen=True)
class Incident:
    """One report as the metrics see it: its fields and rule results, and the case it belongs to."""

    id: str
    case_id: str | None
    fields: dict[str, Any] = field(repr=False)
    rule_results: tuple[dict[str, Any], ...] = field(default=(), repr=False)


@dataclass(frozen=True)
class MetricResult:
    metric: str
    kind: str
    group_by: str
    group_value: str
    value: float | int | None  # None: no incident of the group could be measured
    n: int  # incidents in the group
    incidents: tuple[str, ...]  # ids of the incidents in the group, oldest id first
    other_cases: tuple[str, ...]  # case ids of the group's incidents that are not the tested case

    @property
    def recurs(self) -> bool:
        return bool(self.other_cases)


def branch_metrics(pack: DomainPack, branch_id: str) -> list[dict[str, Any]]:
    """The metric definitions a branch lists, in the branch's order."""
    metrics = pack.pattern_metrics
    branch = next((b for b in pack.cause_branches if b["id"] == branch_id), None)
    if branch is None:
        raise ValueError(f"unknown cause branch {branch_id!r}")
    return [metrics[m] for m in branch.get("pattern_metrics", [])]


def group_value(value: Any) -> str | None:
    """Normalised group key of a field value, None when the field is empty."""
    if value is None or isinstance(value, bool | list | dict):
        return None
    text = " ".join(str(value).split()).casefold()
    return text or None


def measure(
    metric: dict[str, Any], group: str, incidents: Sequence[Incident], *, case_id: str | None
) -> MetricResult:
    """Evaluate `metric` over the incidents whose group_by value equals `group` (already normalised)."""
    params = metric["params"]
    members = sorted(
        (i for i in incidents if group_value(i.fields.get(params["group_by"])) == group), key=lambda i: i.id
    )
    value = _KINDS[metric["kind"]](params, members)
    return MetricResult(
        metric=metric["id"],
        kind=metric["kind"],
        group_by=params["group_by"],
        group_value=group,
        value=value,
        n=len(members),
        incidents=tuple(i.id for i in members),
        other_cases=tuple(sorted({i.case_id for i in members if i.case_id and i.case_id != case_id})),
    )


def _count_by(params: dict[str, Any], members: list[Incident]) -> int:
    distinct = params.get("distinct")
    if distinct is None:
        return len(members)
    return len({v for i in members if (v := group_value(i.fields.get(distinct))) is not None})


def _sum_by(params: dict[str, Any], members: list[Incident]) -> int:
    return sum(v for i in members if isinstance(v := i.fields.get(params["field"]), int) and v >= 0)


def _interval_minutes(params: dict[str, Any], members: list[Incident]) -> float | None:
    gaps: list[float] = []
    for i in members:
        start, end = i.fields.get(params["from_field"]), i.fields.get(params["to_field"])
        if start is None or end is None:
            continue
        minutes = (parse_datetime(end) - parse_datetime(start)).total_seconds() / 60
        if minutes >= 0:
            gaps.append(minutes)
    return round(sum(gaps) / len(gaps), 1) if gaps else None


def _violations_by(params: dict[str, Any], members: list[Incident]) -> int:
    return sum(
        1
        for i in members
        if any(r.get("rule_id") == params["rule"] and r.get("violated") for r in i.rule_results)
    )


_KINDS = {
    "count_by": _count_by,
    "sum_by": _sum_by,
    "interval_minutes": _interval_minutes,
    "violations_by": _violations_by,
}
