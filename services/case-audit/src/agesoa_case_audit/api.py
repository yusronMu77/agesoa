"""Public HTTP API of case-audit (exported to openapi.json). Readers: validators and operators; the public sees
cases through the transparency read models."""

from datetime import datetime
from typing import Annotated, Any, Literal

from agesoa_platform.auth import Principal, authenticate, require_role
from agesoa_platform.events import utc_now
from agesoa_platform.outbox import add_event
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from agesoa_case_audit.audit import run_round
from agesoa_case_audit.decisions import decision_event
from agesoa_case_audit.interview import WITNESS, InterviewError, pending_for_reporter, record_answer
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
    answer: str = Field(min_length=1, max_length=4000)
    choice: str | None = Field(
        None, max_length=200, description="Selected option for scripted (multiple-choice) questions"
    )


class WitnessQuestion(BaseModel):
    question_id: str
    case_id: str
    text: dict[str, str] = Field(description="The question per language (en, id)")
    asked_at: datetime
    synthetic: bool


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


@router.get(
    "/witness/questions",
    summary="Audit questions waiting for me, as the reporter of a report of the case",
    tags=["witness"],
)
async def my_questions(
    request: Request, witness: Annotated[Principal, Depends(authenticate)]
) -> list[WitnessQuestion]:
    async with request.app.state.db.sessions() as session:
        rows = await pending_for_reporter(session, witness.reporter_ref)
    return [WitnessQuestion(**row) for row in rows]


@router.post(
    "/cases/{case_id}/witness-answers",
    status_code=202,
    summary="A witness (the reporter) answers an audit question",
    tags=["witness"],
    responses={
        404: {"description": "No such question for this reporter"},
        409: {"description": "The question already has an answer"},
    },
)
async def answer_question(
    case_id: str,
    body: WitnessAnswer,
    request: Request,
    background: BackgroundTasks,
    witness: Annotated[Principal, Depends(authenticate)],
) -> AuditStep:
    at = utc_now()
    async with request.app.state.db.transaction() as session:
        case = (await session.execute(select(cases).where(cases.c.id == case_id))).mappings().one_or_none()
        if case is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "no such question for this reporter")
        try:
            step = await record_answer(
                session,
                case_id=case_id,
                question=body.question_id,
                answer=body.answer,
                choice=body.choice,
                reporter_ref=witness.reporter_ref,
                at=at,
            )
        except InterviewError as exc:
            code = status.HTTP_409_CONFLICT if exc.kind == "answered" else status.HTTP_404_NOT_FOUND
            raise HTTPException(code, str(exc)) from None
        await add_event(
            session,
            decision_event(
                case_id,
                f"answer:{body.question_id}",
                action="audit.answer_received",
                rule=WITNESS,
                reason="The reporter answered an audit question; an answer is the reporter's own word, "
                "so it is labelled alleged and only feeds the ranking of hypotheses.",
                refs=[f"question:{body.question_id}"],
                at=at,
                synthetic=case["synthetic"],
                status_label="alleged",
            ),
        )
        await run_round(
            session,
            case_id=case_id,
            pack=request.app.state.packs[case["domain"]],
            store=request.app.state.incident_store,
            at=at,
        )
    background.add_task(request.app.state.outbox.dispatch)
    return AuditStep(**step)
