"""Public HTTP API of case-audit (exported to openapi.json). Readers: validators and operators; the public sees
cases through the transparency read models."""

from datetime import datetime
from typing import Annotated, Any, Literal

from agesoa_platform.auth import Principal, authenticate, require_role
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from agesoa_case_audit.tables import audit_trail, cases, findings

router = APIRouter(prefix="/v1", tags=["cases"])
Reader = Annotated[Principal, Depends(require_role("validator", "operator"))]
FindingStatus = Literal["alleged", "supported", "proven"]


class Case(BaseModel):
    id: str
    domain: str
    category: str
    status: Literal["open", "investigating", "awaiting_validation", "final", "closed"]
    region: dict[str, Any] | None
    evidence_status: Literal["available", "likely_lost", "unknown"]
    evidence_deadline_at: datetime | None
    max_finding_status: FindingStatus
    synthetic: bool
    created_at: datetime
    updated_at: datetime


class AuditStep(BaseModel):
    id: int
    step: Literal["hypothesis", "question", "answer", "pattern_test", "conclusion"]
    branch: str | None
    content: dict[str, Any]
    status_label: FindingStatus | None
    evidence_refs: list[str]
    actor: str
    created_at: datetime


class Finding(BaseModel):
    id: str
    statement: str
    status: FindingStatus
    validation: Literal["pending", "approved", "rejected"]
    evidence_refs: list[str]
    created_at: datetime
    validated_at: datetime | None


class CaseDetail(Case):
    findings: list[Finding]


class WitnessAnswer(BaseModel):
    question_id: str
    answer: str = Field(max_length=4000)
    choice: str | None = Field(None, description="Selected option for scripted (multiple-choice) questions")


@router.get("/cases", summary="Cases, newest first")
async def list_cases(
    request: Request,
    reader: Reader,
    case_status: Annotated[str | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[Case]:
    query = select(cases).order_by(cases.c.created_at.desc()).limit(limit)
    if case_status:
        query = query.where(cases.c.status == case_status)
    async with request.app.state.db.sessions() as session:
        rows = (await session.execute(query)).mappings().all()
    return [Case(**row) for row in rows]


@router.get(
    "/cases/{case_id}", summary="One case with its findings", responses={404: {"description": "Unknown case"}}
)
async def get_case(case_id: str, request: Request, reader: Reader) -> CaseDetail:
    async with request.app.state.db.sessions() as session:
        row = (await session.execute(select(cases).where(cases.c.id == case_id))).mappings().one_or_none()
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "case not found")
        items = (
            (await session.execute(select(findings).where(findings.c.case_id == case_id))).mappings().all()
        )
    return CaseDetail(**row, findings=[Finding(**f) for f in items])


@router.get("/cases/{case_id}/audit-trail", summary="Every audit step with its evidence status, oldest first")
async def get_audit_trail(case_id: str, request: Request, reader: Reader) -> list[AuditStep]:
    async with request.app.state.db.sessions() as session:
        rows = (
            (
                await session.execute(
                    select(audit_trail).where(audit_trail.c.case_id == case_id).order_by(audit_trail.c.id)
                )
            )
            .mappings()
            .all()
        )
    return [AuditStep(**row) for row in rows]


@router.post(
    "/cases/{case_id}/witness-answers",
    status_code=202,
    summary="A witness (the reporter) answers an audit question",
    responses={501: {"description": "Not implemented yet (planned for CP3)"}},
)
async def answer_question(
    case_id: str, body: WitnessAnswer, witness: Annotated[Principal, Depends(authenticate)]
) -> AuditStep:
    raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "planned for CP3")
