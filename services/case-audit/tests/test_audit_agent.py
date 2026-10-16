"""Agen Audit: what the model may decide and what code keeps of it (no database, no model call)."""

import json
from collections.abc import AsyncGenerator

import pytest
from agesoa_case_audit.agent import TOP_N, AuditAgent, LexicalRanker
from agesoa_case_audit.settings import REPO_DOMAIN_PACKS, Settings
from agesoa_packs import load_pack
from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types

PACK = load_pack(REPO_DOMAIN_PACKS / "mbg")
SOURCES = [
    ("R-1", "the rice was cooked at 03:00 and eaten at 11:00, the truck had no cooling"),
    ("A-1", "the cook said the pot stayed on the counter for hours"),
]


class ScriptedModel(BaseLlm):
    """A model that answers with whatever the test scripts (or fails)."""

    model: str = "scripted"
    reply: str | None = None
    error: Exception | None = None

    async def generate_content_async(
        self, llm_request: LlmRequest, stream: bool = False
    ) -> AsyncGenerator[LlmResponse]:
        if self.error:
            raise self.error
        yield LlmResponse(content=types.Content(role="model", parts=[types.Part(text=self.reply)]))


def scripted(*hypotheses: dict, **kw) -> AuditAgent:
    return AuditAgent(ScriptedModel(reply=json.dumps({"hypotheses": list(hypotheses)})), **kw)


def hyp(branch, supporting=("R-1",), against=(), reasoning="because"):
    return {
        "branch": branch,
        "supporting": list(supporting),
        "against": list(against),
        "reasoning": reasoning,
    }


async def test_the_rules_model_gives_the_lexical_ranking_through_the_whole_agent_path():
    lexical = await LexicalRanker().rank(PACK, SOURCES, set())
    result = await AuditAgent("rules").rank(PACK, SOURCES, set())

    assert result.method == "model:rules"
    top = [r.branch for r in lexical.ranks if r.score > 0][:TOP_N]
    assert [r.branch for r in result.ranks if r.score > 0] == top
    assert [r.branch for r in result.ranks] and len(result.ranks) == len(PACK.cause_branches)


async def test_the_model_may_reorder_and_its_reasoning_is_kept_for_the_trail():
    result = await scripted(hyp("distribution", ("R-1", "A-1"), reasoning="no cooling on the route")).rank(
        PACK, SOURCES, set()
    )

    assert result.method == "model:scripted"
    first = result.ranks[0]
    assert (first.branch, first.supporting) == ("distribution", ("R-1", "A-1"))
    assert first.score > 0 and result.reasoning["distribution"] == "no cooling on the route"
    # every other branch follows without a score: the interview still works through them, they are no hypothesis
    assert len(result.ranks) == len(PACK.cause_branches)
    assert all(r.score == 0 for r in result.ranks[1:])


async def test_branches_and_sources_the_model_made_up_are_dropped():
    result = await scripted(
        hyp("witchcraft"),
        hyp("process", supporting=("R-404",)),  # a source that is not in the case: no evidence, no hypothesis
        hyp("distribution", supporting=("R-1", "R-404"), against=("A-404",)),
        hyp("distribution"),  # the same branch twice
    ).rank(PACK, SOURCES, set())

    scored = [r for r in result.ranks if r.score > 0]
    assert [(r.branch, r.supporting, r.against) for r in scored] == [("distribution", ("R-1",), ())]


async def test_at_most_top_n_hypotheses_are_kept():
    branches = [b["id"] for b in PACK.cause_branches]
    result = await scripted(*[hyp(b) for b in branches]).rank(PACK, SOURCES, set())

    assert [r.branch for r in result.ranks if r.score > 0] == branches[:TOP_N]


async def test_the_rules_linked_to_a_branch_come_from_the_pack_not_from_the_model():
    rule = next(r for r in PACK.rules if r.get("supports_branch"))
    branch = rule["supports_branch"]
    other = next(b["id"] for b in PACK.cause_branches if b["id"] != branch)

    result = await scripted(hyp(branch), hyp(other)).rank(PACK, SOURCES, {rule["id"]})

    by_branch = {r.branch: r for r in result.ranks}
    assert by_branch[branch].violated_rules == (rule["id"],)
    assert by_branch[other].violated_rules == ()


@pytest.mark.parametrize(
    "agent",
    [
        AuditAgent(ScriptedModel(error=RuntimeError("quota exceeded"))),
        AuditAgent(ScriptedModel(reply="not json at all")),
        AuditAgent(ScriptedModel(reply=json.dumps({"hypotheses": []}))),
        AuditAgent(ScriptedModel(reply=json.dumps({"hypotheses": [hyp("witchcraft")]}))),
    ],
    ids=["model error", "not json", "no hypothesis", "nothing usable"],
)
async def test_a_failing_or_useless_model_falls_back_to_the_lexical_ranking(agent):
    result = await agent.rank(PACK, SOURCES, set())

    assert result.method == "lexical"
    assert result.ranks == (await LexicalRanker().rank(PACK, SOURCES, set())).ranks


async def test_a_case_without_sources_asks_nothing_of_the_model():
    result = await AuditAgent(ScriptedModel(error=AssertionError("must not be called"))).rank(PACK, [], set())

    assert result.method == "lexical"


def test_the_rules_model_is_for_local_and_demo_only(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://x:y@localhost/z")
    monkeypatch.setenv("ENVIRONMENT", "staging")
    monkeypatch.setenv("AUDIT_MODEL", "rules")
    monkeypatch.setenv("DEMO_MODE", "false")
    monkeypatch.setenv("OIDC_AUDIENCE", "agesoa")
    with pytest.raises(ValueError, match="AUDIT_MODEL=rules"):
        Settings()
    monkeypatch.setenv("AUDIT_MODEL", "gemini-3.8-flash")
    assert Settings().audit_model == "gemini-3.8-flash"
