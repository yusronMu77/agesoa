"""Organizations (newsrooms, agencies) prove control of their domain with a DNS TXT record before their staff can
become validators or receive reports (P1b, SCR-060).

Registration returns a token; the organization publishes `agesoa-verify=<token>` as a TXT record of its domain
and asks for a check. Only an exact match verifies it; the result goes to the decision log and, once verified,
to the other domains as `organisasi.terverifikasi`.
"""

from __future__ import annotations

import hashlib
import logging
import re
import secrets
import socket
from datetime import datetime
from typing import Annotated, Any, Literal

import dns.asyncresolver
import dns.exception
import dns.resolver
from agesoa_platform.app import flush_outbox
from agesoa_platform.auth import Principal, require_role
from agesoa_platform.events import isoformat, new_event, utc_now
from agesoa_platform.outbox import add_event
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from agesoa_trust import SERVICE
from agesoa_trust.settings import Settings
from agesoa_trust.tables import organizations

router = APIRouter(prefix="/v1/organizations", tags=["organizations"])
OrgAdmin = Annotated[Principal, Depends(require_role("org_admin"))]
NOT_FOUND = {404: {"description": "No such organization of yours"}}
TXT_PREFIX = "agesoa-verify="
HOSTNAME = re.compile(r"^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")
# The same rule for the contract (OpenAPI), without lookahead and case-insensitive: the length bounds are
# `min_length`/`max_length` of the field (the 253 characters of a DNS name count the raw input, so a trailing dot
# never pushes a name past the limit). Input is lowercased and a trailing dot (fully qualified name) dropped
# before HOSTNAME is applied.
DOMAIN_PATTERN = r"^([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}\.?$"
log = logging.getLogger(__name__)


class Region(BaseModel):
    regency_code: str | None = None
    regency_name: str = Field(min_length=1, max_length=120)


class OrganizationIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    kind: Literal["newsroom", "agency"]
    domain: str = Field(
        min_length=4,
        max_length=253,
        pattern=DOMAIN_PATTERN,
        description="The organization's own domain, e.g. redaksi.example.org",
    )
    region: Region

    @field_validator("domain")
    @classmethod
    def _domain(cls, value: str) -> str:
        value = value.strip().rstrip(".").lower()
        if not HOSTNAME.match(value):
            raise ValueError("not a domain name")
        return value


class Organization(BaseModel):
    organization_id: str
    name: str
    kind: Literal["newsroom", "agency"]
    domain: str
    region: dict[str, Any] | None
    status: Literal["awaiting_dns", "verified", "rejected"]
    txt_record: str = Field(description="The TXT value to publish on the domain")
    verified_at: datetime | None
    synthetic: bool
    created_at: datetime


class DnsCheck(BaseModel):
    result: Literal["verified", "already_verified", "no_record", "token_mismatch", "dns_error"]
    detail: str
    organization: Organization


def _out(row: Any) -> Organization:
    return Organization(
        organization_id=row["id"],
        name=row["name"],
        kind=row["kind"],
        domain=row["domain"],
        region=row["region"],
        status=row["status"],
        txt_record=TXT_PREFIX + row["verification_token"],
        verified_at=row["verified_at"],
        synthetic=row["synthetic"],
        created_at=row["created_at"],
    )


@router.post(
    "",
    status_code=201,
    summary="Register an organization; returns the TXT record to publish",
    responses={409: {"description": "Domain already registered"}},
)
async def register(body: OrganizationIn, request: Request, admin: OrgAdmin) -> Organization:
    settings: Settings = request.app.state.settings
    values = {
        "id": "ORG-" + secrets.token_hex(6).upper(),
        "name": body.name.strip(),
        "kind": body.kind,
        "domain": body.domain,
        "status": "awaiting_dns",
        "verification_token": secrets.token_urlsafe(24),
        "region": {"regency_code": body.region.regency_code, "regency_name": body.region.regency_name},
        "synthetic": settings.demo_mode,
        "admin_uid": admin.uid,
    }
    try:
        async with request.app.state.db.transaction() as session:
            row = (
                (await session.execute(organizations.insert().values(values).returning(organizations)))
                .mappings()
                .one()
            )
    except IntegrityError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "this domain is already registered") from exc
    return _out(row)


@router.get("", summary="My organizations")
async def mine(request: Request, admin: OrgAdmin) -> list[Organization]:
    query = (
        select(organizations)
        .where(organizations.c.admin_uid == admin.uid)
        .order_by(organizations.c.created_at)
    )
    async with request.app.state.db.sessions() as session:
        return [_out(r) for r in (await session.execute(query)).mappings().all()]


@router.get("/{organization_id}", summary="One of my organizations", responses=NOT_FOUND)
async def one(organization_id: str, request: Request, admin: OrgAdmin) -> Organization:
    async with request.app.state.db.sessions() as session:
        return _out(await _mine(session, organization_id, admin.uid))


@router.post(
    "/{organization_id}/dns-check",
    summary="Look up the TXT record and verify the organization",
    responses=NOT_FOUND,
)
async def dns_check(
    organization_id: str, request: Request, admin: OrgAdmin, background: BackgroundTasks
) -> DnsCheck:
    settings: Settings = request.app.state.settings
    async with request.app.state.db.sessions() as session:
        row = await _mine(session, organization_id, admin.uid)
    if row["status"] == "verified":
        return DnsCheck(
            result="already_verified", detail="The domain was already verified.", organization=_out(row)
        )

    result, detail = await check_txt(row["domain"], TXT_PREFIX + row["verification_token"], settings)
    now = utc_now()
    async with request.app.state.db.transaction() as session:
        if result == "verified":
            row = (
                await session.execute(
                    update(organizations)
                    .where(organizations.c.id == organization_id, organizations.c.status != "verified")
                    .values(status="verified", verified_at=now)
                    .returning(organizations)
                )
            ).mappings().one_or_none() or await _mine(session, organization_id, admin.uid)
            await add_event(session, _verified(row, now))
        # Every check (also a failed one) is a rule decision in the public log: no TXT values, only the outcome.
        await add_event(session, _check_decision(row, result, now))
    background.add_task(flush_outbox, request)
    log.info("dns check", extra={"detail": {"organization_id": organization_id, "result": result}})
    return DnsCheck(result=result, detail=detail, organization=_out(row))


async def check_txt(domain: str, expected: str, settings: Settings) -> tuple[str, str]:
    resolver = dns.asyncresolver.Resolver(configure=settings.dns_resolver is None)
    if settings.dns_resolver:
        host, _, port = settings.dns_resolver.rpartition(":")
        resolver.nameservers = [socket.gethostbyname(host)]
        resolver.port = int(port)
    resolver.lifetime = 5.0
    try:
        answer = await resolver.resolve(domain, "TXT")
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer):
        return "no_record", f"No TXT record found on {domain}."
    except dns.exception.DNSException as exc:
        return "dns_error", f"DNS lookup failed ({type(exc).__name__}); try again later."
    values = [b"".join(r.strings).decode("utf-8", "replace") for r in answer]
    if expected in values:
        return "verified", f"TXT record found on {domain}."
    if any(v.startswith(TXT_PREFIX) for v in values):
        return (
            "token_mismatch",
            f"A TXT record {TXT_PREFIX}… exists on {domain} but the token does not match.",
        )
    return "no_record", f"No {TXT_PREFIX} TXT record on {domain}."


async def _mine(session: Any, organization_id: str, uid: str) -> Any:
    query = select(organizations).where(
        organizations.c.id == organization_id, organizations.c.admin_uid == uid
    )
    row = (await session.execute(query)).mappings().one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "organization not found")
    return row


def _verified(row: Any, now: datetime) -> dict[str, Any]:
    return new_event(
        "organisasi.terverifikasi",
        source=SERVICE,
        subject=row["id"],
        data={
            "organization_id": row["id"],
            "name": row["name"],
            "kind": row["kind"],
            "domain": row["domain"],
            "method": "dns_txt",
            "verified_at": isoformat(now),
            "synthetic": row["synthetic"],
            "admin_ref": row["admin_uid"],
        },
    )


def _check_decision(row: Any, result: str, now: datetime) -> dict[str, Any]:
    verified = result == "verified"
    decision_id = "ORGV-" + hashlib.sha256(f"{row['id']}|{isoformat(now)}".encode()).hexdigest()[:24]
    return new_event(
        "keputusan.dicatat",
        source=SERVICE,
        subject=decision_id,
        data={
            "decision_id": decision_id,
            "actor": {"kind": "rule", "name": "dns_txt_verification", "service": SERVICE},
            "action": "organization.verified" if verified else "organization.dns_check_failed",
            "subject": {"kind": "organization", "id": row["id"]},
            "reason": (
                f"TXT record {TXT_PREFIX}<token> found on {row['domain']}; {row['name']} controls the domain."
                if verified
                else f"Domain check for {row['domain']}: {result.replace('_', ' ')}; still awaiting DNS."
            ),
            "evidence_refs": [],
            "occurred_at": isoformat(now),
            "synthetic": row["synthetic"],
        },
    )
