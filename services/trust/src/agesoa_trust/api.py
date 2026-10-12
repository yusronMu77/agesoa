"""Public HTTP API of trust (exported to openapi.json)."""

from datetime import datetime
from typing import Annotated, Literal

from agesoa_platform.auth import Principal, require_role
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from agesoa_trust.tables import validation_requests

router = APIRouter(prefix="/v1", tags=["validation"])
Validator = Annotated[Principal, Depends(require_role("validator", "operator"))]


class ValidationRequest(BaseModel):
    finding_id: str
    case_id: str
    domain: str
    statement: str
    status_label: Literal["alleged", "supported", "proven"]
    required_roles: list[str]
    evidence_refs: list[str]
    outcome: Literal["approved", "rejected"] | None
    synthetic: bool
    received_at: datetime


class DecisionIn(BaseModel):
    decision: Literal["approve", "reject"]
    note: str = Field("", max_length=4000)
    confidence: float | None = Field(None, ge=0, le=1)


class DecisionOut(BaseModel):
    finding_id: str
    decision: Literal["approve", "reject"]
    quorum_reached: bool
    outcome: Literal["approved", "rejected"] | None


@router.get("/validation-requests", summary="Findings waiting for validation")
async def list_requests(request: Request, validator: Validator) -> list[ValidationRequest]:
    query = (
        select(validation_requests)
        .where(validation_requests.c.outcome.is_(None))
        .order_by(validation_requests.c.received_at)
    )
    async with request.app.state.db.sessions() as session:
        rows = (await session.execute(query)).mappings().all()
    return [ValidationRequest(**row) for row in rows]


@router.post(
    "/validation-requests/{finding_id}/decisions",
    status_code=201,
    summary="Approve or reject a finding; quorum is evaluated by code",
    responses={501: {"description": "Not implemented yet (planned for CP2)"}},
)
async def decide(finding_id: str, body: DecisionIn, validator: Validator) -> DecisionOut:
    raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "planned for CP2")
