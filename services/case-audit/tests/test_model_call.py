"""Model calls of Agen Audit are bounded and tried once more when Vertex AI hangs or answers 429 (no model, no database)."""

import asyncio
import json
import time
from typing import Any

import pytest
from agesoa_case_audit import model_call
from agesoa_case_audit.agent import AuditAgent, LexicalRanker
from agesoa_case_audit.pattern_agent import PlannedTest
from agesoa_case_audit.patterns import PatternTest
from agesoa_case_audit.settings import REPO_DOMAIN_PACKS
from agesoa_packs import MetricResult, load_pack
from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_response import LlmResponse
from google.genai import errors, types
from pydantic import Field

PACK = load_pack(REPO_DOMAIN_PACKS / "mbg")
SOURCES = [("R-1", "the rice was cooked at 03:00 and eaten at 11:00, the truck had no cooling")]
PLAN = [
    PlannedTest("process", "cooking_to_eating", "sppg a"),
    PlannedTest("process", "cooking_to_eating", "sppg b"),
]


def quota_error() -> errors.ClientError:
    return errors.ClientError(429, {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED"}})


@pytest.fixture(autouse=True)
def no_retry_pause(monkeypatch):
    monkeypatch.setattr(model_call, "RETRY_DELAY_SECONDS", 0)


class Flaky(BaseLlm):
    """Answers after the listed steps: an exception is raised, "hang" never answers, anything else answers."""

    model: str = "flaky"
    steps: list[Any] = Field(default_factory=list)
    calls: int = 0

    def answer(self, llm_request) -> list[types.Part]:
        raise NotImplementedError

    async def generate_content_async(self, llm_request, stream=False):
        self.calls += 1
        step = self.steps.pop(0) if self.steps else None
        if step == "hang":
            await asyncio.sleep(60)
        if isinstance(step, Exception):
            raise step
        yield LlmResponse(content=types.Content(role="model", parts=self.answer(llm_request)))


class Ranks(Flaky):
    def answer(self, llm_request):
        hypothesis = {
            "branch": "distribution",
            "supporting": ["R-1"],
            "against": [],
            "reasoning": "no cooling",
        }
        return [types.Part(text=json.dumps({"hypotheses": [hypothesis]}))]


class AsksForTests(Flaky):
    """Asks for every planned test, then says it is done."""

    def answer(self, llm_request):
        last = llm_request.contents[-1]
        if any(p.function_response for p in last.parts or []):
            return [types.Part(text="done")]
        return [
            types.Part(
                function_call=types.FunctionCall(
                    name="check_pattern",
                    args={"branch": t.branch, "metric_id": t.metric_id, "group": t.group},
                )
            )
            for t in PLAN
        ]


class Executed:
    def __init__(self):
        self.calls: list[PlannedTest] = []

    async def __call__(self, test: PlannedTest) -> PatternTest:
        self.calls.append(test)
        metric = MetricResult(test.metric_id, "interval_minutes", "kitchen", test.group, 390, 2, ("R-1",), ())
        return PatternTest(test.branch, {"id": test.metric_id}, metric, 90, "database")


async def count_calls(outcomes: list[Any], **kw):
    """`attempts` over a call that goes through `outcomes` (an exception is raised, "hang" never returns)."""
    calls = 0

    async def call():
        nonlocal calls
        calls += 1
        step = outcomes.pop(0)
        if step == "hang":
            await asyncio.sleep(60)
        if isinstance(step, Exception):
            raise step
        return step

    return await model_call.attempts(call, what="test", **kw), lambda: calls


async def test_a_call_that_hangs_is_tried_again():
    result, calls = await count_calls(["hang", "answer"], timeout=0.2, tries=2)

    assert (result, calls()) == ("answer", 2)


async def test_a_quota_or_server_error_is_tried_again():
    for code in (429, 500, 503):
        error = errors.APIError(code, {"error": {"code": code}})
        result, calls = await count_calls([error, "answer"], timeout=1, tries=2)
        assert (result, calls()) == ("answer", 2)


async def test_it_gives_up_after_the_attempts_and_within_their_time():
    started = time.monotonic()
    with pytest.raises(TimeoutError):
        await count_calls(["hang", "hang", "never"], timeout=0.2, tries=2)

    assert time.monotonic() - started < 1


async def test_a_failure_another_try_cannot_fix_is_not_repeated():
    outcomes = [RuntimeError("bad output"), "answer"]
    with pytest.raises(RuntimeError):
        await count_calls(outcomes, timeout=1, tries=2)
    assert outcomes == ["answer"]  # only the first was used

    outcomes = [errors.ClientError(400, {"error": {"code": 400}}), "answer"]
    with pytest.raises(errors.ClientError):
        await count_calls(outcomes, timeout=1, tries=2)
    assert outcomes == ["answer"]


async def test_one_attempt_means_no_retry():
    outcomes = ["hang", "answer"]
    with pytest.raises(TimeoutError):
        await count_calls(outcomes, timeout=0.2, tries=1)
    assert outcomes == ["answer"]


@pytest.mark.parametrize("first", ["hang", quota_error()], ids=["timeout", "429"])
async def test_the_ranking_uses_the_second_attempt_instead_of_the_lexical_fallback(first):
    model = Ranks(steps=[first])
    result = await AuditAgent(model, timeout=0.3).rank(PACK, SOURCES, set())

    assert model.calls == 2
    assert result.method == "model:flaky"
    assert result.ranks[0].branch == "distribution" and result.ranks[0].score > 0


async def test_the_ranking_falls_back_when_both_attempts_fail():
    model = Ranks(steps=["hang", "hang"])
    started = time.monotonic()
    result = await AuditAgent(model, timeout=0.3).rank(PACK, SOURCES, set())

    assert model.calls == 2 and time.monotonic() - started < 2
    assert result.method == "lexical"
    assert result.ranks == (await LexicalRanker().rank(PACK, SOURCES, set())).ranks


async def test_the_ranking_does_not_repeat_unusable_output():
    model = Ranks(steps=[RuntimeError("bad output")])
    result = await AuditAgent(model, timeout=0.3).rank(PACK, SOURCES, set())

    assert model.calls == 1 and result.method == "lexical"


async def test_the_pattern_agent_asks_again_and_does_not_run_a_test_twice():
    # First attempt: the tests are asked for and run, then the model hangs instead of answering the tool results.
    model = AsksForTests(steps=[None, "hang"])
    execute = Executed()
    done = await AuditAgent(model, pattern_timeout=0.3).run_pattern_tests(PLAN, execute, case_id="C-1")

    assert set(done) == {t.key for t in PLAN}
    assert model.calls == 4  # ask, hang, ask again, done
    assert [t.key for t in execute.calls] == [t.key for t in PLAN]  # once each: the retry used what was kept


async def test_the_pattern_agent_failing_twice_runs_the_whole_plan_directly():
    model = AsksForTests(steps=["hang", "hang"])
    execute = Executed()
    started = time.monotonic()
    done = await AuditAgent(model, pattern_timeout=0.3).run_pattern_tests(PLAN, execute, case_id="C-2")

    assert model.calls == 2 and time.monotonic() - started < 3
    assert set(done) == {t.key for t in PLAN}
    assert len(execute.calls) == len(PLAN)
