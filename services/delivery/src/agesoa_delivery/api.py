"""Public HTTP API of delivery (exported to openapi.json): audit reports and the institution API
(packages/contracts/webhook/README.md)."""

from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import select

from agesoa_delivery.tables import audit_reports

router = APIRouter()
PLANNED = {501: {"description": "Not implemented yet (planned for CP4)"}}


class RootCause(BaseModel):
    statement: str
    status: Literal["alleged", "supported", "proven"]
    evidence_refs: list[str]


class AuditReport(BaseModel):
    id: str
    case_id: str
    domain: str
    summary: str
    root_causes: list[RootCause]
    recommendations: list[str]
    region: dict[str, Any] | None
    synthetic: bool
    created_at: datetime


class StatusUpdate(BaseModel):
    status: Literal["received", "in_progress", "done"]
    note: str = Field("", max_length=4000)
    internal_ticket: str | None = Field(None, max_length=120)


class Attachment(BaseModel):
    name: str
    url: str


class Reply(BaseModel):
    body: str = Field(min_length=1, max_length=10000)
    attachments: list[Attachment] = []


class Accepted(BaseModel):
    id: str
    received_at: datetime


@router.get(
    "/v1/cases/{case_id}/audit-report",
    tags=["audit reports"],
    summary="Audit report of a case (public once the finding is validated)",
    responses={404: {"description": "No audit report for this case yet"}},
)
async def get_audit_report(case_id: str, request: Request) -> AuditReport:
    async with request.app.state.db.sessions() as session:
        row = (
            (await session.execute(select(audit_reports).where(audit_reports.c.case_id == case_id)))
            .mappings()
            .one_or_none()
        )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "audit report not found")
    return AuditReport(**row)


_institution_key = HTTPBearer(
    scheme_name="InstitutionApiKey", description="Bearer <institution API key>", auto_error=False
)
UNAUTHORIZED = {401: {"description": "Missing or invalid institution API key"}}


def require_institution_key(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_institution_key)],
) -> str:
    if credentials is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "missing institution API key",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return credentials.credentials


ApiKey = Annotated[str, Depends(require_institution_key)]


@router.post(
    "/api/v1/cases/{case_id}/status",
    tags=["institution API"],
    status_code=202,
    summary="Institution updates the follow-up status of a case",
    responses=PLANNED | UNAUTHORIZED,
)
async def update_status(case_id: str, body: StatusUpdate, authorization: ApiKey) -> Accepted:
    raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "planned for CP4")


@router.post(
    "/api/v1/cases/{case_id}/reply",
    tags=["institution API"],
    status_code=202,
    summary="Institution submits a right of reply",
    responses=PLANNED | UNAUTHORIZED,
)
async def submit_reply(case_id: str, body: Reply, authorization: ApiKey) -> Accepted:
    raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "planned for CP4")
