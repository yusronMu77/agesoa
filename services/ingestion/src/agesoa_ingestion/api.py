"""Public HTTP API of ingestion (exported to openapi.json)."""

from datetime import datetime
from typing import Any, Literal

from agesoa_packs import DomainPack, evaluate_rules, evidence_status
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

router = APIRouter(prefix="/v1")
FindingStatus = Literal["alleged", "supported", "proven"]


class Label(BaseModel):
    en: str
    id: str


class DomainPackSummary(BaseModel):
    id: str
    version: str
    name: Label
    categories: list[str]
    rules: list[str]


class RuleResultOut(BaseModel):
    rule_id: str
    violated: bool | None = Field(description="null when the rule could not be evaluated (missing field)")
    detail: str


class EvidenceStatusOut(BaseModel):
    status: Literal["available", "likely_lost", "unknown"]
    deadline_at: datetime | None
    max_finding_status: FindingStatus


class EvaluateRequest(BaseModel):
    fields: dict[str, Any] = Field(
        description="Report fields keyed by the pack's report_fields ids; datetimes in ISO 8601 with offset"
    )
    received_at: datetime


class EvaluateResponse(BaseModel):
    rule_results: list[RuleResultOut]
    evidence: EvidenceStatusOut
    evidence_tips: list[Label] = Field(
        description="Shown to the reporter while physical evidence is still available"
    )
    missing_required: list[str]


def _pack(request: Request, pack_id: str) -> DomainPack:
    pack = request.app.state.packs.get(pack_id)
    if pack is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"unknown domain pack {pack_id!r}")
    return pack


@router.get("/domain-packs", tags=["domain packs"], summary="Domain packs loaded by the core engine")
async def list_packs(request: Request) -> list[DomainPackSummary]:
    return [DomainPackSummary(**p.summary()) for p in request.app.state.packs.values()]


@router.get(
    "/domain-packs/{pack_id}",
    tags=["domain packs"],
    summary="Full pack document (categories, report fields, rules, cause framework, ...)",
    responses={404: {"description": "Unknown pack"}},
)
async def get_pack(pack_id: str, request: Request) -> dict[str, Any]:
    return _pack(request, pack_id).document


@router.post(
    "/domain-packs/{pack_id}/evaluate",
    tags=["domain packs"],
    summary="Evaluate the pack's rules and evidence deadline for a set of report fields",
    responses={
        404: {"description": "Unknown pack"},
        422: {"description": "Invalid fields (e.g. datetime without offset)"},
    },
)
async def evaluate(pack_id: str, body: EvaluateRequest, request: Request) -> EvaluateResponse:
    pack = _pack(request, pack_id)
    try:
        results = evaluate_rules(pack, body.fields)
        evidence = evidence_status(pack, body.fields, body.received_at)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    return EvaluateResponse(
        rule_results=[
            RuleResultOut(rule_id=r.rule_id, violated=r.violated, detail=r.detail) for r in results
        ],
        evidence=EvidenceStatusOut(**evidence.__dict__),
        evidence_tips=pack.document["evidence_tips"] if evidence.status == "available" else [],
        missing_required=[f for f in pack.required_field_ids() if body.fields.get(f) in (None, "", [])],
    )
