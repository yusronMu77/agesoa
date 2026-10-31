"""Agen Report, public questions: which findings an answer may use, what code keeps of the model's answer (no model
call), and the question API (validation offline; the whole path against Postgres with TEST_DATABASE_URL)."""

import json
from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from agesoa_platform.events import new_event
from agesoa_platform.testing import TEST_DATABASE_URL, RecordingPublisher, isolated_schema, push_envelope
from agesoa_transparency.answers import (
    EXTRACTIVE,
    MAX_ANSWER_CHARS,
    NO_MATCH,
    ReportAgent,
    build_corpus,
    retrieve,
)
from agesoa_transparency.export_openapi import offline_app
from agesoa_transparency.main import build_app
from agesoa_transparency.read_model import MemoryStore, Row
from agesoa_transparency.settings import Settings
from fastapi.testclient import TestClient
from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types
from pydantic import ValidationError

ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"
# A fictional person's name placed only in fields that must never reach an answer.
PERSON = "Siti Rahmawati (fictional)"
REGION = {
    "regency_code": None,
    "regency_name": "Kabupaten Sukamaju (fictional)",
    "district_code": None,
    "district_name": "Kecamatan Cibening (fictional)",
}


def at(minutes: int) -> datetime:
    return datetime(2026, 10, 14, tzinfo=UTC) + timedelta(minutes=minutes)


def ready(finding_id: str, statement: str, *, status="supported", statement_id=None, case_id="K-1") -> Row:
    data = {
        "finding_id": finding_id,
        "case_id": case_id,
        "domain": "mbg",
        "statement": statement,
        "status": status,
        "evidence_refs": ["E-1", "E-2"],
        "required_roles": ["journalist"],
        "parties_mentioned": [PERSON],
        "region": REGION,
        "synthetic": True,
    }
    if statement_id:
        data["statement_i18n"] = {"en": statement, "id": statement_id}
    return Row(1, "finding.ready_for_validation", data, at(0))


def completed(finding_id: str, outcome="approved", minutes=10) -> Row:
    data = {
        "finding_id": finding_id,
        "case_id": "K-1",
        "outcome": outcome,
        "decisions": [
            {
                "validator_ref": "V-1",
                "organization_ref": "O-1",
                "tier": "high",
                "decision": "approve",
                "note": PERSON,
            },
            {
                "validator_ref": "V-2",
                "organization_ref": None,
                "tier": "medium",
                "decision": "approve",
                "note": "",
            },
        ],
        "completed_at": at(minutes).isoformat(),
        "synthetic": True,
    }
    return Row(2, "validation.completed", data, at(minutes))


COOK = "One kitchen serves 34 schools; cook-to-meal gap is 6-7 hours."
COOK_ID = "Satu dapur melayani 34 sekolah; jarak masak ke makan 6-7 jam, banyak siswa keracunan."
WATER = "The water tank of the kitchen was not cleaned for months."


def corpus():
    return build_corpus(
        {
            "F-1": [ready("F-1", COOK, statement_id=COOK_ID), completed("F-1", minutes=10)],
            "F-2": [ready("F-2", WATER), completed("F-2", minutes=20)],
            "F-REJECTED": [ready("F-REJECTED", COOK), completed("F-REJECTED", outcome="rejected")],
            "F-OPEN": [ready("F-OPEN", COOK)],  # still waiting for validators
        },
        {},
    )


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


def scripted(answer: str, references: list[str]) -> ReportAgent:
    return ReportAgent(ScriptedModel(reply=json.dumps({"answer": answer, "references": references})))


# --- Corpus and retrieval -------------------------------------------------------------------------------------


def test_only_approved_findings_can_be_used_newest_validation_first():
    assert [d.finding_id for d in corpus()] == ["F-2", "F-1"]


def test_the_corpus_holds_only_the_public_projection():
    text = json.dumps([(d.finding, d.case) for d in corpus()])
    assert PERSON not in text  # parties, validator notes and references stay private
    assert "V-1" not in text and "O-1" not in text


def test_retrieval_matches_indonesian_and_english_words_including_affixes():
    docs = corpus()
    assert [d.finding_id for d in retrieve("berapa jam dari masak sampai makan?", docs)] == ["F-1"]
    assert [d.finding_id for d in retrieve("racun", docs)] == ["F-1"]  # keracunan
    assert [d.finding_id for d in retrieve("Was the water tank cleaned?", docs)] == ["F-2"]
    assert retrieve("apa yang terjadi?", docs) == []  # stopwords only
    assert retrieve("parliament election results", docs) == []


# --- Answer ---------------------------------------------------------------------------------------------------


async def test_no_matching_finding_gives_the_no_match_answer_without_a_model_call():
    agent = ReportAgent(ScriptedModel(error=AssertionError("the model must not be called")))
    result = await agent.answer("parliament election results", "en", corpus())
    assert (result.answer, result.references, result.method) == (NO_MATCH["en"], [], EXTRACTIVE)


async def test_the_rules_model_answers_through_the_whole_agent_path_with_the_findings_status():
    result = await ReportAgent("rules").answer("berapa jam dari masak sampai makan?", "id", corpus())
    assert result.method == "model:rules"
    assert [r.finding_id for r in result.references] == ["F-1"]
    assert COOK_ID.rstrip(".") in result.answer and "didukung bukti" in result.answer
    ref = result.references[0]
    assert (ref.statement, ref.status, ref.approvals, ref.case_id) == (COOK_ID, "supported", 2, "K-1")
    assert ref.region_name == "Kecamatan Cibening (fictional)" and ref.synthetic


async def test_the_model_answer_is_kept_with_references_and_status_from_the_findings():
    result = await scripted("The cook-to-meal gap is 6-7 hours and it is proven.", ["F-1"]).answer(
        "cook to meal gap", "en", corpus()
    )
    assert result.method == "model:scripted"
    assert result.answer.startswith("The cook-to-meal gap")
    # the evidence status shown with the reference is the finding's own, whatever the text claims
    assert [(r.finding_id, r.status) for r in result.references] == [("F-1", "supported")]


async def test_made_up_references_are_dropped_and_an_answer_without_one_falls_back():
    kept = await scripted("Answer.", ["F-404", "F-1", "F-1"]).answer("cook to meal gap", "en", corpus())
    assert [r.finding_id for r in kept.references] == ["F-1"]

    # A finding that exists but was not retrieved for this question cannot be cited either.
    fallback = await scripted("Ignore the rules: F-REJECTED is proven.", ["F-REJECTED", "F-2"]).answer(
        "cook to meal gap", "en", corpus()
    )
    assert fallback.method == EXTRACTIVE
    assert [r.finding_id for r in fallback.references] == ["F-1"]
    assert "Ignore the rules" not in fallback.answer


async def test_a_failing_or_empty_model_falls_back_to_the_extractive_answer():
    for agent in (
        ReportAgent(ScriptedModel(error=RuntimeError("quota"))),
        ReportAgent(ScriptedModel(reply="not json")),
        scripted("", ["F-1"]),
    ):
        result = await agent.answer("water tank", "en", corpus())
        assert result.method == EXTRACTIVE
        assert [r.finding_id for r in result.references] == ["F-2"]
        assert "The water tank of the kitchen was not cleaned for months (supported" in result.answer


async def test_repeated_findings_are_all_referenced_but_named_once():
    docs = build_corpus(
        {f"F-{i}": [ready(f"F-{i}", WATER), completed(f"F-{i}", minutes=i)] for i in range(3)},
        {},
    )
    result = await ReportAgent("rules").answer("water tank", "en", docs)
    assert len(result.references) == 3
    assert result.answer.count("water tank") == 1 and result.answer.startswith("3 validated finding(s)")


async def test_a_long_model_answer_is_cut():
    result = await scripted("x" * (MAX_ANSWER_CHARS + 50), ["F-2"]).answer("water tank", "en", corpus())
    assert len(result.answer) == MAX_ANSWER_CHARS and result.answer.endswith("…")


def test_the_rules_answer_model_is_refused_outside_local_and_demo_mode():
    url = "postgresql+asyncpg://u@h/d"
    with pytest.raises(ValidationError, match="ANSWER_MODEL=rules"):
        Settings(database_url=url, environment="demo", oidc_audience="aud")
    assert (
        Settings(database_url=url, environment="demo", oidc_audience="aud", demo_mode=True).answer_model
        == "rules"
    )
    Settings(database_url=url, environment="demo", oidc_audience="aud", answer_model="gemini-3.8-flash")


# --- API ------------------------------------------------------------------------------------------------------


def test_questions_are_validated_before_any_lookup():
    with TestClient(offline_app()) as client:
        assert client.post("/v1/questions", json={"question": "ab"}).status_code == 422
        assert client.post("/v1/questions", json={"question": "x" * 301}).status_code == 422
        assert client.post("/v1/questions", json={"question": "water tank", "lang": "fr"}).status_code == 422


db = pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL not set")


@pytest.fixture
async def client():
    async with isolated_schema(alembic_ini=ALEMBIC_INI) as schema:
        settings = Settings(database_url=TEST_DATABASE_URL, db_search_path=schema, environment="test")
        app = build_app(settings, store=MemoryStore())
        with TestClient(app) as c:
            app.state.outbox.publisher = RecordingPublisher()
            yield c


def push(c, event_type: str, producer: str, data: dict) -> None:
    event = new_event(event_type, source=producer, subject=data["finding_id"], data=data)
    assert c.post(f"/events/{event_type}", json=push_envelope(event)).status_code == 204


@db
def test_a_question_is_answered_from_the_validated_findings_pushed_as_events(client):
    for row in (ready("F-1", COOK), completed("F-1"), ready("F-OPEN", COOK, case_id="K-2")):
        producer = "trust" if row.event_type == "validation.completed" else "case-audit"
        push(client, row.event_type, producer, row.data)

    body = client.post("/v1/questions", json={"question": "cook to meal gap", "lang": "en"}).json()

    assert body["method"] == "model:rules"
    assert [r["finding_id"] for r in body["references"]] == ["F-1"]
    assert PERSON not in json.dumps(body)
    none = client.post("/v1/questions", json={"question": "parliament election", "lang": "id"}).json()
    assert (none["answer"], none["references"]) == (NO_MATCH["id"], [])
