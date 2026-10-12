"""Verification of Google-signed OIDC tokens on service-to-service endpoints (Pub/Sub push, Cloud Scheduler).

Only tokens with the configured audience and an allow-listed service-account email are accepted. In the
`local`/`test` environments the check is skipped (the local relay and emulator send no token); every other
environment requires OIDC_AUDIENCE at startup (see settings).
"""

from __future__ import annotations

from fastapi import HTTPException, Request, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

_transport = google_requests.Request()


def bearer_token(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    return token.strip() if scheme.lower() == "bearer" and token.strip() else None


def verify_google_caller(request: Request, allowed_emails: frozenset[str]) -> str:
    settings = request.app.state.settings
    if settings.is_local:
        return "local"
    token = bearer_token(request)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    try:
        claims = id_token.verify_oauth2_token(token, _transport, audience=settings.oidc_audience)
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token") from exc
    email = claims.get("email", "")
    if not claims.get("email_verified") or email not in allowed_emails:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "caller not allowed")
    return email


def require_push_caller(request: Request) -> str:
    return verify_google_caller(request, request.app.state.settings.push_invokers)


def require_internal_caller(request: Request) -> str:
    return verify_google_caller(request, request.app.state.settings.internal_invokers)
