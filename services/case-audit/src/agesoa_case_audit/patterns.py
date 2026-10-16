"""Pattern tests: "does the same cause show up in other incidents" (why a problem keeps coming back).

The audit agent never writes a query. It calls `check_pattern` with a cause branch, one of that branch's metrics and a
time window; all three are checked against the domain pack and bounded before anything runs. The metric itself is a
fixed, parameterised query kind from `agesoa_packs.metrics`; here only the reading of incidents is plugged in
(`IncidentStore`): the case-audit database (default, works everywhere) or the BigQuery event archive.

A pattern recurs when an incident of *another case* sits in the same group (same kitchen, same supplier, ...). That
is evidence from other reports, so a recurring pattern is `supported` (capped by the case's maximum finding status)
and a pattern that does not recur is `alleged`: nothing was found, nothing is proven.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Protocol

from agesoa_packs import DomainPack, Incident, MetricResult, branch_metrics, measure
from agesoa_packs.metrics import MAX_WINDOW_DAYS
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from agesoa_case_audit.tables import case_sources, cases

ACTOR = "pattern_test"  # a rule, never a person
WINDOW_DAYS = 90
MAX_GROUPS = 3  # distinct group values of one case that are tested per metric


class PatternError(ValueError):
    """A pattern test was asked for something the pack does not define."""


class IncidentStore(Protocol):
    """Where the incidents of other cases are read from."""

    name: str

    async def find(
        self,
        session: AsyncSession,
        *,
        domain: str,
        group_by: str,
        group: str,
        since: datetime,
        until: datetime,
    ) -> list[Incident]:
        """Reports of `domain` with normalised `group_by` value `group`, whose case's first incident is in the
        window. May include the tested case's own reports."""
        ...


class DatabaseIncidentStore:
    """Reads the reports case-audit already keeps (`case_sources`): no other service's database."""

    name = "database"

    async def find(
        self,
        session: AsyncSession,
        *,
        domain: str,
        group_by: str,
        group: str,
        since: datetime,
        until: datetime,
    ) -> list[Incident]:
        value = case_sources.c.snapshot["data"]["fields"][group_by].astext  # group_by is a bound parameter
        normalised = func.lower(func.regexp_replace(func.btrim(value), r"\s+", " ", "g"))
        rows = (
            await session.execute(
                select(case_sources.c.source_id, case_sources.c.case_id, case_sources.c.snapshot)
                .join(cases, cases.c.id == case_sources.c.case_id)
                .where(
                    case_sources.c.source_kind == "report",
                    cases.c.domain == domain,
                    cases.c.occurred_at.between(since, until),
                    normalised == group,
                )
                .order_by(case_sources.c.source_id)
            )
        ).all()
        return [
            Incident(
                r.source_id,
                r.case_id,
                r.snapshot["data"]["fields"],
                tuple(r.snapshot["data"]["rule_results"]),
            )
            for r in rows
        ]


@dataclass(frozen=True)
class PatternTest:
    branch: str
    metric: dict[str, Any]
    result: MetricResult
    window_days: int
    store: str

    @property
    def status(self) -> str:
        return "supported" if self.result.recurs else "alleged"


def validate(pack: DomainPack, branch: str, metric_id: str, window_days: int) -> dict[str, Any]:
    """The metric definition for (branch, metric_id), or PatternError. Nothing outside the pack can be asked."""
    try:
        metrics = branch_metrics(pack, branch)
    except ValueError as exc:
        raise PatternError(str(exc)) from None
    metric = next((m for m in metrics if m["id"] == metric_id), None)
    if metric is None:
        raise PatternError(f"branch {branch!r} has no pattern metric {metric_id!r}")
    if not 1 <= window_days <= MAX_WINDOW_DAYS:
        raise PatternError(f"window_days must be between 1 and {MAX_WINDOW_DAYS}")
    return metric


async def check_pattern(
    session: AsyncSession,
    store: IncidentStore,
    pack: DomainPack,
    *,
    case_id: str,
    domain: str,
    own: Sequence[Incident],
    branch: str,
    metric_id: str,
    group: str,
    window_start: datetime,
    until: datetime,
    window_days: int = WINDOW_DAYS,
) -> PatternTest:
    """One metric of one branch for one group value of the case. `own` are the case's reports."""
    metric = validate(pack, branch, metric_id, window_days)
    found = await store.find(
        session,
        domain=domain,
        group_by=metric["params"]["group_by"],
        group=group,
        since=window_start,
        until=until,
    )
    incidents = {
        i.id: i for i in [*found, *own]
    }  # the case's own reports count once, whichever side lists them
    result = measure(metric, group, list(incidents.values()), case_id=case_id)
    return PatternTest(branch, metric, result, window_days, store.name)


def window(occurred_at: datetime, at: datetime, window_days: int = WINDOW_DAYS) -> tuple[datetime, datetime]:
    """From `window_days` before the case's first incident up to the time of the audit round."""
    return occurred_at - timedelta(days=window_days), max(at, occurred_at)
