"""Role claims in the Firebase Auth emulator (HTTP mocked); against the real emulator in the devenv E2E suite."""

import json

import httpx
import pytest
from agesoa_trust.identity import IdentityAdmin
from agesoa_trust.settings import Settings

SETTINGS = Settings(
    _env_file=None,
    database_url="postgresql+asyncpg://u:p@localhost:1/x",
    firebase_auth_emulator_host="auth:9099",
    google_cloud_project="agesoa-local",
)


def admin_with(handler):
    return IdentityAdmin(SETTINGS, httpx.AsyncClient(transport=httpx.MockTransport(handler)))


async def test_new_account_gets_its_role_claims():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((request.url.path, request.headers["authorization"], json.loads(request.content)))
        return httpx.Response(200, json={"localId": "demo-validator-1"})

    await admin_with(handler).ensure_account("demo-validator-1", "v1@demo.agesoa.local", "pw", {"validator"})
    (create_path, auth, create), (update_path, _, update) = seen
    assert create_path == "/identitytoolkit.googleapis.com/v1/projects/agesoa-local/accounts"
    assert auth == "Bearer owner"
    assert create["localId"] == "demo-validator-1" and "customAttributes" not in create
    # Claims go through accounts:update: account creation ignores them.
    assert update_path.endswith("/accounts:update")
    assert update["localId"] == "demo-validator-1" and json.loads(update["customAttributes"]) == {
        "validator": True
    }


async def test_existing_account_is_updated_instead():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path.rsplit("/", 1)[-1])
        if request.url.path.endswith("/accounts"):
            return httpx.Response(400, json={"error": {"message": "DUPLICATE_LOCAL_ID"}})
        return httpx.Response(200, json={})

    await admin_with(handler).ensure_account("u1", "a@b.local", "pw", {"validator"})
    assert calls == ["accounts", "accounts:update"]


async def test_unknown_roles_are_refused():
    with pytest.raises(ValueError, match="unknown roles"):
        await admin_with(lambda r: httpx.Response(200, json={})).set_roles("u1", {"admin"})
