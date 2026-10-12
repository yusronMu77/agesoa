"""Public HTTP API of transparency (exported to openapi.json). Read-only: the log is written only from events."""

from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Path, Query, Request
from pydantic import BaseModel
from sqlalchemy import select

from agesoa_transparency.chain import verify_chain
from agesoa_transparency.tables import chain_head, decision_log

router = APIRouter(prefix="/v1", tags=["decision log"])
# Sequence numbers are Postgres bigint.
MAX_SEQ = 2**63 - 1


class LogEntry(BaseModel):
    seq: int
    event_id: str
    decision_id: str
    source_service: str
    action: str
    subject_kind: str
    subject_id: str
    entry: dict[str, Any]
    prev_hash: str
    hash: str
    recorded_at: datetime


class LogPage(BaseModel):
    items: list[LogEntry]
    next_after: int | None


class ChainHead(BaseModel):
    seq: int
    hash: str
    updated_at: datetime


class ChainVerification(BaseModel):
    ok: bool
    length: int
    head_hash: str
    first_invalid_seq: int | None = None
    reason: str | None = None


@router.get("/log", summary="Decision log, oldest first")
async def list_log(
    request: Request,
    after: Annotated[
        int, Query(ge=0, le=MAX_SEQ, description="Return entries with seq greater than this")
    ] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    subject_kind: str | None = None,
    subject_id: str | None = None,
) -> LogPage:
    query = select(decision_log).where(decision_log.c.seq > after).order_by(decision_log.c.seq).limit(limit)
    if subject_kind:
        query = query.where(decision_log.c.subject_kind == subject_kind)
    if subject_id:
        query = query.where(decision_log.c.subject_id == subject_id)
    async with request.app.state.db.sessions() as session:
        rows = (await session.execute(query)).mappings().all()
    items = [LogEntry(**row) for row in rows]
    return LogPage(items=items, next_after=items[-1].seq if len(items) == limit else None)


@router.get("/log/head", summary="Current chain tip")
async def get_head(request: Request) -> ChainHead:
    async with request.app.state.db.sessions() as session:
        row = (
            (await session.execute(select(chain_head.c.seq, chain_head.c.hash, chain_head.c.updated_at)))
            .mappings()
            .one()
        )
    return ChainHead(**row)


@router.get("/log/verify", summary="Recompute the whole chain and report the first broken entry, if any")
async def verify(request: Request) -> ChainVerification:
    async with request.app.state.db.sessions() as session:
        result = await verify_chain(session)
    return ChainVerification(**result.__dict__)


@router.get(
    "/log/{seq}", summary="One decision log entry", responses={404: {"description": "No entry with this seq"}}
)
async def get_entry(seq: Annotated[int, Path(ge=1, le=MAX_SEQ)], request: Request) -> LogEntry:
    async with request.app.state.db.sessions() as session:
        row = (
            (await session.execute(select(decision_log).where(decision_log.c.seq == seq)))
            .mappings()
            .one_or_none()
        )
    if row is None:
        raise HTTPException(404, "log entry not found")
    return LogEntry(**row)
