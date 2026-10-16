"""End-user authentication: Identity Platform (Firebase Auth) ID tokens with role claims.

Roles are custom claims set by `trust` (validator, org_admin, operator). Anonymous reporters have a uid and no
role. In `local`/`test` only, `Bearer dev:<uid>:<role,role>` is accepted so services run without an auth
emulator, and with FIREBASE_AUTH_EMULATOR_HOST set the emulator's unsigned ID tokens are accepted (audience,
issuer and expiry still checked); any other environment rejects both.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass, field

from fastapi import HTTPException, Request, status
from google.auth import jwt as google_jwt
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from agesoa_platform.hashing import sha256_hex
from agesoa_platform.oidc import bearer_token

ROLE_CLAIMS = ("validator", "org_admin", "operator")
_transport = google_requests.Request()


@dataclass(frozen=True)
class Principal:
    uid: str
    roles: frozenset[str] = field(default_factory=frozenset)
    anonymous: bool = False
    claims: dict = field(default_factory=dict, compare=False, repr=False)

    @property
    def reporter_ref(self) -> str:
        """Pseudonymous, stable per uid: what services store instead of the uid. Every service derives it the same
        way, so a reporter can be matched across services without any of them keeping the uid."""
        return sha256_hex(f"reporter:{self.uid}".encode())[:40]


def _from_dev_token(token: str) -> Principal:
    _, uid, *rest = token.split(":")
    roles = frozenset(r for r in (rest[0].split(",") if rest else []) if r)
    if not uid:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid dev token")
    return Principal(uid=uid, roles=roles, anonymous=not roles)


def authenticate(request: Request) -> Principal:
    settings = request.app.state.settings
    token = bearer_token(request)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    if token.startswith("dev:"):
        if not settings.is_local:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token")
        return _from_dev_token(token)
    try:
        if settings.is_local and settings.firebase_auth_emulator_host:
            claims = _emulator_claims(token, settings.google_cloud_project)
        else:
            claims = id_token.verify_firebase_token(token, _transport, audience=settings.google_cloud_project)
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token") from exc
    if not claims:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token")
    roles = frozenset(r for r in ROLE_CLAIMS if claims.get(r))
    provider = claims.get("firebase", {}).get("sign_in_provider")
    return Principal(uid=claims["sub"], roles=roles, anonymous=provider == "anonymous", claims=claims)


def _emulator_claims(token: str, project: str) -> dict:
    """Firebase Auth emulator tokens are unsigned (alg "none"): check what can be checked (local/test only)."""
    claims = google_jwt.decode(token, verify=False)
    if claims.get("aud") != project or claims.get("iss") != f"https://securetoken.google.com/{project}":
        raise ValueError("token is not for this project")
    if float(claims.get("exp", 0)) < time.time():
        raise ValueError("token expired")
    if not claims.get("sub"):
        raise ValueError("token without subject")
    return claims


def require_role(*roles: str) -> Callable[[Request], Principal]:
    """FastAPI dependency: authenticated and holding at least one of `roles`."""

    def dependency(request: Request) -> Principal:
        principal = authenticate(request)
        if not principal.roles & set(roles):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "missing role")
        return principal

    return dependency
