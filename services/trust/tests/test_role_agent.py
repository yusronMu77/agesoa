"""Agen Peran without a real model: the rule-based fallback and the overload fallback (no Gemini calls)."""

import json
from collections.abc import AsyncGenerator
from pathlib import Path

import pytest
from agesoa_trust.role_agent import RoleAgent, RulesModel
from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import errors, types

DOCS = Path(__file__).resolve().parents[1] / "demo" / "documents"


class FakeModel(BaseLlm):
    """Answers with a fixed JSON body, or raises an API error with the given code."""

    model: str = "fake"
    body: dict | None = None
    error_code: int | None = None
    calls: int = 0

    async def generate_content_async(
        self, llm_request: LlmRequest, stream: bool = False
    ) -> AsyncGenerator[LlmResponse]:
        self.calls += 1
        if self.error_code:
            raise errors.APIError(self.error_code, {"error": {"message": "busy", "status": "UNAVAILABLE"}})
        yield LlmResponse(content=types.Content(role="model", parts=[types.Part(text=json.dumps(self.body))]))


async def test_rules_fallback_reads_the_demo_documents_and_nothing_else():
    agent = RoleAgent.rules()
    doc = await agent.read((DOCS / "press-id-card.png").read_bytes(), "image/png")
    assert (doc.document_type, doc.issuer, doc.valid_until.isoformat(), doc.model) == (
        "press_id",
        "Redaksi Sukamaju (fictional)",
        "2027-06-30",
        "rules",
    )
    assert doc.extracted()["name"] == "Dewi Lestari"
    other = await agent.read(b"\x89PNG\r\n\x1a\nnot really", "image/png")
    assert other.document_type == "unreadable" and other.confidence == 0.0


async def test_an_overloaded_model_falls_back_to_the_next_one():
    busy = FakeModel(model="busy", error_code=503)
    good = FakeModel(
        model="good", body={"document_type": "certificate", "confidence": 0.8, "valid_until": "bad"}
    )
    doc = await RoleAgent([busy, good], attempts=2, backoff=0).read(b"img", "image/png")
    assert busy.calls == 2 and doc.model == "good" and doc.valid_until is None


async def test_non_retryable_errors_and_exhausted_models_raise():
    with pytest.raises(errors.APIError):
        await RoleAgent([FakeModel(error_code=400)], backoff=0).read(b"img", "image/png")
    with pytest.raises(RuntimeError, match="unavailable"):
        await RoleAgent([FakeModel(error_code=503)], attempts=1, backoff=0).read(b"img", "image/png")


async def test_model_output_is_checked():
    long = "x" * 500
    model = FakeModel(
        body={"document_type": "press_id", "name": long, "confidence": 0.5, "anomalies": ["a"] * 30}
    )
    doc = await RoleAgent([model]).read(b"img", "image/png")
    assert len(doc.name) == 200 and len(doc.anomalies) == 10
    with pytest.raises(ValueError):
        await RoleAgent([FakeModel(body={"document_type": "press_id", "confidence": 3})]).read(
            b"img", "image/png"
        )


def test_rules_model_is_named_rules():
    assert RulesModel().model == "rules"
