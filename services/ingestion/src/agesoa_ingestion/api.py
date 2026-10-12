"""Public HTTP API of ingestion (exported to openapi.json)."""

from datetime import datetime
from typing import Annotated, Any, Literal

from agesoa_packs import DomainPack, evaluate_rules, evidence_status
from agesoa_platform.auth import Principal, authenticate
from fastapi import APIRouter, Depends, HTTPException, Request, status
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


# --- Citizen reports (contract for CP1: AGESOA Witness draft -> correction -> submit) ---------------------------


class Region(BaseModel):
    regency_code: str | None = None
    regency_name: str
    district_code: str | None = None
    district_name: str | None = None


class ReportCreate(BaseModel):
    domain: str = "mbg"
    narrative: str | None = Field(None, max_length=5000)
    shared_post_url: str | None = Field(None, description="Link to a social post the reporter shares")
    location: tuple[float, float] | None = Field(
        None, description="Approximate [lat, lon]; converted to a district on arrival and never stored"
    )


class ReportPatch(BaseModel):
    category: str | None = None
    fields: dict[str, Any] | None = None
    narrative: str | None = Field(None, max_length=5000)


class EvidenceOut(BaseModel):
    evidence_id: str
    kind: Literal["photo", "audio", "video", "screenshot"]
    media_type: str
    sha256: str


class Report(BaseModel):
    id: str
    status: Literal["draft", "submitted", "withdrawn"]
    domain: str
    category: str | None
    narrative: str | None
    fields: dict[str, Any]
    missing_required: list[str]
    rule_results: list[RuleResultOut]
    evidence_status: EvidenceStatusOut | None
    evidence_tips: list[Label]
    evidence: list[EvidenceOut]
    region: Region | None
    created_at: datetime
    updated_at: datetime
    submitted_at: datetime | None


class MediaUploadRequest(BaseModel):
    kind: Literal["photo", "audio", "video", "screenshot"]
    media_type: str = Field(examples=["image/jpeg", "audio/webm"])
    size_bytes: int = Field(gt=0, le=50 * 1024 * 1024)


class MediaUpload(BaseModel):
    evidence_id: str
    upload_url: str = Field(description="Signed URL for a single PUT")
    expires_at: datetime


Reporter = Annotated[Principal, Depends(authenticate)]
PLANNED = {501: {"description": "Not implemented yet (planned for CP1)"}}


def _planned() -> None:
    raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "planned for CP1")


@router.post("/reports", tags=["reports"], status_code=201, summary="Start a report draft", responses=PLANNED)
async def create_report(body: ReportCreate, reporter: Reporter) -> Report:
    _planned()


@router.get("/reports/{report_id}", tags=["reports"], summary="Read one of my reports", responses=PLANNED)
async def get_report(report_id: str, reporter: Reporter) -> Report:
    _planned()


@router.patch("/reports/{report_id}", tags=["reports"], summary="Correct a draft", responses=PLANNED)
async def patch_report(report_id: str, body: ReportPatch, reporter: Reporter) -> Report:
    _planned()


@router.post(
    "/reports/{report_id}/media",
    tags=["reports"],
    status_code=201,
    summary="Get a signed upload URL",
    responses=PLANNED,
)
async def request_upload(report_id: str, body: MediaUploadRequest, reporter: Reporter) -> MediaUpload:
    _planned()


@router.post(
    "/reports/{report_id}/submit",
    tags=["reports"],
    summary="Confirm the draft; publishes laporan.diterima",
    responses=PLANNED,
)
async def submit_report(report_id: str, reporter: Reporter) -> Report:
    _planned()
