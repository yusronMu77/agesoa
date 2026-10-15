"""User accounts and role claims in Identity Platform (Firebase Auth): roles are custom claims that every service
reads from the ID token (agesoa_platform.auth). Only trust sets them.

Locally the Firebase Auth emulator stands in (FIREBASE_AUTH_EMULATOR_HOST, `Bearer owner` admin access); against
Identity Platform the calls use the service's own Google credentials.
"""

from __future__ import annotations

import json
from typing import Any

import httpx

from agesoa_trust.settings import Settings

ROLE_CLAIMS = ("validator", "org_admin", "operator")


class IdentityError(RuntimeError):
    pass


class IdentityAdmin:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None):
        self.project = settings.google_cloud_project
        self.emulator = settings.firebase_auth_emulator_host
        host = f"http://{self.emulator}" if self.emulator else "https://identitytoolkit.googleapis.com"
        self.base = (
            f"{host}/identitytoolkit.googleapis.com/v1/projects/{self.project}"
            if self.emulator
            else (f"{host}/v1/projects/{self.project}")
        )
        self.client = client or httpx.AsyncClient(timeout=10)

    async def _headers(self) -> dict[str, str]:
        if self.emulator:
            return {"Authorization": "Bearer owner"}
        import google.auth
        import google.auth.transport.requests

        credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        credentials.refresh(google.auth.transport.requests.Request())
        return {"Authorization": f"Bearer {credentials.token}"}

    async def _post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        response = await self.client.post(f"{self.base}/{path}", json=body, headers=await self._headers())
        if response.status_code >= 400:
            raise IdentityError(f"{path}: HTTP {response.status_code} {response.text[:200]}")
        return response.json()

    @staticmethod
    def claims(roles: set[str]) -> str:
        unknown = roles - set(ROLE_CLAIMS)
        if unknown:
            raise ValueError(f"unknown roles: {sorted(unknown)}")
        return json.dumps({role: True for role in sorted(roles)})

    async def claims_of(self, uid: str) -> set[str]:
        """Current role claims of an account (empty when it has none)."""
        users = (await self._post("accounts:lookup", {"localId": [uid]})).get("users") or []
        raw = users[0].get("customAttributes") if users else None
        current = json.loads(raw) if raw else {}
        return {role for role in ROLE_CLAIMS if current.get(role)}

    async def set_roles(self, uid: str, roles: set[str]) -> None:
        """Replace the role claims of an account (takes effect at the user's next token refresh)."""
        await self._post("accounts:update", {"localId": uid, "customAttributes": self.claims(roles)})

    async def ensure_account(self, uid: str, email: str, password: str, roles: set[str]) -> None:
        """Create the account with this uid (or update it) and set its roles. Used for seeded demo accounts."""
        # Account creation ignores customAttributes (Identity Platform and the emulator alike), so the claims are
        # always set with a separate update, as the Admin SDK does.
        claims = self.claims(roles)
        body = {"localId": uid, "email": email, "password": password, "emailVerified": True}
        try:
            await self._post("accounts", body)
        except IdentityError as exc:
            if "DUPLICATE_LOCAL_ID" not in str(exc) and "EMAIL_EXISTS" not in str(exc):
                raise
            body = body | {"customAttributes": claims}
        else:
            body = {"localId": uid, "customAttributes": claims}
        await self._post("accounts:update", body)
