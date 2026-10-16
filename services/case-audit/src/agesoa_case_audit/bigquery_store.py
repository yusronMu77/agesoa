"""Incidents from the BigQuery event archive (`agesoa_events.events`, one row per Pub/Sub message of every topic).

The archive holds every `laporan.diterima` ever published, also those that case-audit no longer keeps a case for, so
"does the same kitchen show up elsewhere" can look further back than the case database. The query is one fixed
statement: the group value, the domain, the window and the event type are query parameters; the only thing written into
the text is the report field name, which comes from the domain pack and is checked against a strict pattern. The job
is capped (`maximum_bytes_billed`) and reads only the partitions of the window.

The archive knows reports, not cases: the case of each report is looked up in `case_sources`; a report case-audit has
no case for counts as a case of its own (`archive:<id>`), because it cannot be part of the tested one.
"""

from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime
from typing import Any

from agesoa_packs import Incident
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agesoa_case_audit.patterns import Found, PatternError
from agesoa_case_audit.tables import case_sources

TABLE = re.compile(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_]+\.[A-Za-z0-9_]+")  # project.dataset.table
FIELD = re.compile(r"[a-z][a-z0-9_]{0,63}")
EVENT_TYPE = "agesoa.laporan.diterima"
MAX_ROWS = 500
MAX_BYTES_BILLED = 200 * 1024 * 1024  # a job that would read more fails instead of billing it
TIMEOUT_SECONDS = 20

QUERY = """
SELECT report_id, fields, rule_results
FROM (
  SELECT
    JSON_VALUE(data, '$.data.report_id') AS report_id,
    TO_JSON_STRING(JSON_QUERY(data, '$.data.fields')) AS fields,
    TO_JSON_STRING(JSON_QUERY(data, '$.data.rule_results')) AS rule_results,
    ROW_NUMBER() OVER (
      PARTITION BY JSON_VALUE(data, '$.data.report_id') ORDER BY publish_time DESC
    ) AS latest
  FROM `{table}`
  WHERE publish_time BETWEEN @since AND @until
    AND JSON_VALUE(attributes, '$."ce-type"') = @event_type
    AND JSON_VALUE(data, '$.data.domain') = @domain
    AND LOWER(REGEXP_REPLACE(TRIM(JSON_VALUE(data, '$.data.fields.{field}')), r'\\s+', ' ')) = @grp
)
WHERE latest = 1
ORDER BY report_id
LIMIT {limit}
"""


class BigQueryIncidentStore:
    name = "bigquery"

    def __init__(
        self,
        table: str,
        *,
        client: Any = None,
        max_bytes_billed: int = MAX_BYTES_BILLED,
        timeout: float = TIMEOUT_SECONDS,
    ):
        if not TABLE.fullmatch(table):
            raise ValueError(f"BigQuery table must look like project.dataset.table, got {table!r}")
        self.table = table
        self._client = client
        self._max_bytes = max_bytes_billed
        self._timeout = timeout

    def _bq(self) -> Any:
        if self._client is None:
            from google.cloud import bigquery

            self._client = bigquery.Client(project=self.table.split(".")[0])
        return self._client

    def _job_config(self, params: dict[str, tuple[str, Any]]) -> Any:
        from google.cloud import bigquery

        return bigquery.QueryJobConfig(
            query_parameters=[bigquery.ScalarQueryParameter(n, t, v) for n, (t, v) in params.items()],
            maximum_bytes_billed=self._max_bytes,
            labels={"service": "case-audit", "purpose": "pattern-test"},
        )

    def _rows(self, field: str, params: dict[str, tuple[str, Any]]) -> list[Any]:
        sql = QUERY.format(table=self.table, field=field, limit=MAX_ROWS)
        job = self._bq().query(sql, job_config=self._job_config(params), timeout=self._timeout)
        return list(job.result(timeout=self._timeout))

    async def find(
        self,
        session: AsyncSession,
        *,
        domain: str,
        group_by: str,
        group: str,
        since: datetime,
        until: datetime,
    ) -> Found:
        if not FIELD.fullmatch(group_by):
            raise PatternError(f"{group_by!r} is not a report field name")
        params = {
            "since": ("TIMESTAMP", since),
            "until": ("TIMESTAMP", until),
            "event_type": ("STRING", EVENT_TYPE),
            "domain": ("STRING", domain),
            "grp": ("STRING", group),
        }
        rows = await asyncio.to_thread(self._rows, group_by, params)
        cases = await _cases_of(session, [r.report_id for r in rows])
        return Found(
            [
                Incident(
                    r.report_id,
                    cases.get(r.report_id, f"archive:{r.report_id}"),
                    json.loads(r.fields or "{}"),
                    tuple(json.loads(r.rule_results or "[]")),
                )
                for r in rows
            ],
            self.name,
        )


async def _cases_of(session: AsyncSession, report_ids: list[str]) -> dict[str, str]:
    if not report_ids:
        return {}
    found = await session.execute(
        select(case_sources.c.source_id, case_sources.c.case_id).where(
            case_sources.c.source_kind == "report", case_sources.c.source_id.in_(report_ids)
        )
    )
    return {r.source_id: r.case_id for r in found}
