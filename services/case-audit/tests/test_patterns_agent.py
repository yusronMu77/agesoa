"""Agen Audit runs pattern tests as tool calls: what the tool allows, and what happens when the agent cannot."""

import json
from collections.abc import AsyncGenerator
from datetime import UTC, datetime

import pytest
from agesoa_case_audit.agent import AuditAgent
from agesoa_case_audit.bigquery_store import BigQueryIncidentStore
from agesoa_case_audit.pattern_agent import PlannedTest, run_directly, run_with_agent
from agesoa_case_audit.patterns import FallbackIncidentStore, Found, PatternTest
from agesoa_case_audit.settings import Settings
from agesoa_packs import Incident, MetricResult
from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types
from pydantic import Field, ValidationError

PLAN = [
    PlannedTest("process", "cooking_to_eating", "sppg a"),
    PlannedTest("process", "cooking_to_eating", "sppg b"),
]
SINCE = datetime(2026, 7, 1, tzinfo=UTC)
UNTIL = datetime(2026, 10, 1, tzinfo=UTC)


def outcome(test: PlannedTest) -> PatternTest:
    metric = MetricResult(
        test.metric_id, "interval_minutes", "kitchen", test.group, 390, 2, ("R-1", "R-2"), ("C-9",)
    )
    return PatternTest(test.branch, {"id": test.metric_id}, metric, 90, "database")


class Executed:
    def __init__(self):
        self.calls: list[PlannedTest] = []

    async def __call__(self, test: PlannedTest) -> PatternTest:
        self.calls.append(test)
        return outcome(test)


class Calls(BaseLlm):
    """A model that asks for the tests the test scripts (then says it is done)."""

    model: str = "scripted"
    calls: list[dict]
    seen: list[str] = Field(default_factory=list)

    async def generate_content_async(
        self, llm_request: LlmRequest, stream: bool = False
    ) -> AsyncGenerator[LlmResponse]:
        last = llm_request.contents[-1]
        if any(p.function_response for p in last.parts or []):
            self.seen.extend(json.dumps(p.function_response.response) for p in last.parts or [])
            parts = [types.Part(text="done")]
        else:
            parts = [
                types.Part(function_call=types.FunctionCall(name="check_pattern", args=c)) for c in self.calls
            ]
        yield LlmResponse(content=types.Content(role="model", parts=parts))


async def test_the_scripted_agent_calls_the_tool_for_every_planned_test():
    execute = Executed()
    done = await run_with_agent("rules", None, PLAN, execute, case_id="C-1")

    assert set(done) == {t.key for t in PLAN}
    assert [t.key for t in execute.calls] == [t.key for t in PLAN]
    assert all(t.status == "supported" for t in done.values())


async def test_a_model_can_only_run_tests_the_case_offered():
    execute = Executed()
    model = Calls(
        calls=[
            {"branch": "process", "metric_id": "cooking_to_eating", "group": "sppg a"},
            {"branch": "process", "metric_id": "cooking_to_eating", "group": "someone elses kitchen"},
            {"branch": "supplier", "metric_id": "anything", "group": "sppg a"},
            {"branch": "process", "metric_id": "cooking_to_eating", "group": "sppg a", "window_days": 365},
        ]
    )
    done = await run_with_agent(model, None, PLAN, execute, case_id="C-1")

    assert [t.group for t in execute.calls] == ["sppg a"]  # the other three were refused, nothing was queried
    assert list(done) == [PLAN[0].key]
    refused = [s for s in model.seen if '"ok": false' in s]
    assert len(refused) == 3


async def test_a_model_may_skip_tests_and_only_the_run_ones_are_returned():
    execute = Executed()
    model = Calls(calls=[{"branch": "process", "metric_id": "cooking_to_eating", "group": "sppg b"}])

    done = await run_with_agent(model, None, PLAN, execute, case_id="C-1")

    assert list(done) == [PLAN[1].key]


async def test_when_the_agent_fails_the_whole_plan_runs_directly():
    class Down(BaseLlm):
        model: str = "down"

        async def generate_content_async(self, llm_request, stream=False):
            raise RuntimeError("model unavailable")
            yield  # pragma: no cover

    execute = Executed()
    done = await AuditAgent(Down()).run_pattern_tests(PLAN, execute, case_id="C-1")

    assert set(done) == {t.key for t in PLAN}
    assert len(execute.calls) == len(PLAN)  # once each, by the direct run


async def test_the_direct_run_is_the_baseline():
    execute = Executed()
    assert list(await run_directly(PLAN, execute)) == [t.key for t in PLAN]


class FakeSession:
    """The case_sources lookup: report id -> case id."""

    def __init__(self, cases):
        self.cases = cases

    async def execute(self, statement):
        return [type("R", (), {"source_id": k, "case_id": v}) for k, v in self.cases.items()]


class FakeBigQuery:
    def __init__(self, rows=(), error=None):
        self.rows, self.error, self.queries = rows, error, []

    def query(self, sql, job_config=None, timeout=None):
        if self.error:
            raise self.error
        self.queries.append((sql, job_config))
        rows = self.rows
        return type("Job", (), {"result": lambda self_, timeout=None: rows})()


def row(report_id, kitchen="SPPG A"):
    return type(
        "Row",
        (),
        {
            "report_id": report_id,
            "fields": json.dumps({"kitchen": kitchen}),
            "rule_results": json.dumps([{"rule_id": "x", "violated": True}]),
        },
    )


async def test_bigquery_incidents_are_read_by_one_fixed_parameterised_query_with_a_cost_cap():
    bq = FakeBigQuery([row("R-1"), row("R-7")])
    store = BigQueryIncidentStore("proj.agesoa_events.events", client=bq)
    group = "sppg a' OR 1=1 --"  # a quote or comment in the group value is a parameter, never part of the statement

    found = await store.find(
        FakeSession({"R-1": "C-1"}), domain="mbg", group_by="kitchen", group=group, since=SINCE, until=UNTIL
    )

    sql, config = bq.queries[0]
    assert group not in sql and "1=1" not in sql
    assert "`proj.agesoa_events.events`" in sql and "publish_time BETWEEN @since AND @until" in sql
    assert config.maximum_bytes_billed == 200 * 1024 * 1024
    names = {p.name: p.value for p in config.query_parameters}
    assert (
        names["grp"] == group
        and names["domain"] == "mbg"
        and names["event_type"] == "agesoa.report.received"
        # reports archived before the catalog names were made English still count
        and names["legacy_event_type"] == "agesoa.laporan.diterima"
    )
    assert "IN (@event_type, @legacy_event_type)" in sql
    assert found.store == "bigquery"
    # a report case-audit keeps in a case belongs to it; one it has no case for is a case of its own
    assert [(i.id, i.case_id) for i in found.incidents] == [("R-1", "C-1"), ("R-7", "archive:R-7")]
    assert found.incidents[0].fields == {"kitchen": "SPPG A"}


async def test_a_field_name_outside_the_pattern_never_reaches_the_statement():
    store = BigQueryIncidentStore("proj.agesoa_events.events", client=FakeBigQuery())
    with pytest.raises(Exception, match="not a report field name"):
        await store.find(
            FakeSession({}), domain="mbg", group_by="kitchen') OR 1=1 --", group="x", since=SINCE, until=UNTIL
        )
    with pytest.raises(ValueError, match=r"project.dataset.table"):
        BigQueryIncidentStore("events; DROP TABLE x")


class Database:
    name = "database"

    async def find(self, session, **query):
        return Found([Incident("R-3", "C-3", {"kitchen": "SPPG A"})], self.name)


async def test_when_the_archive_cannot_answer_the_database_does_and_the_test_says_so():
    store = FallbackIncidentStore(
        BigQueryIncidentStore("proj.agesoa_events.events", client=FakeBigQuery(error=TimeoutError("slow"))),
        Database(),
    )

    found = await store.find(
        FakeSession({}), domain="mbg", group_by="kitchen", group="sppg a", since=SINCE, until=UNTIL
    )

    assert found.store == "database" and [i.id for i in found.incidents] == ["R-3"]


def test_the_bigquery_store_needs_its_table():
    base = {"database_url": "postgresql+asyncpg://x:y@localhost/z", "environment": "local"}
    assert Settings(**base).incident_store == "database"
    with pytest.raises(ValidationError, match="BIGQUERY_EVENTS_TABLE"):
        Settings(**base, incident_store="bigquery")
    assert Settings(**base, incident_store="bigquery", bigquery_events_table="p.d.t").bigquery_events_table
