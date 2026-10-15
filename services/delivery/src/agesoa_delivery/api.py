"""Public HTTP API of delivery (exported to openapi.json): audit reports. The agency dashboard and the institution
API are in institutions.py (packages/contracts/webhook/README.md)."""

from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select

from agesoa_delivery.tables import audit_reports

router = APIRouter()


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
    category: str | None
    synthetic: bool
    created_at: datetime


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
