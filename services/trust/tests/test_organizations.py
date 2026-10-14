"""Organization registration + DNS TXT verification (TC-101) against Postgres and an in-process test DNS server."""

import asyncio
import json
from pathlib import Path

import pytest
from agesoa_contracts import validate_event
from agesoa_platform.devtools.dns import Zone, _Protocol
from agesoa_platform.testing import TEST_DATABASE_URL, RecordingPublisher, isolated_schema
from agesoa_trust.demo import DEMO_FILE
from agesoa_trust.main import build_app
from agesoa_trust.settings import Settings
from fastapi.testclient import TestClient

pytestmark = pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL not set")
ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"
ADMIN = {"Authorization": "Bearer dev:org-admin-1:org_admin"}
OTHER_ADMIN = {"Authorization": "Bearer dev:org-admin-2:org_admin"}
VALIDATOR = {"Authorization": "Bearer dev:demo-validator-1:validator"}
NEWSROOM = {
    "name": "Warta Sukamaju (fictional)",
    "kind": "newsroom",
    "domain": "Warta.Example.org.",
    "region": {"regency_name": "Kabupaten Sukamaju (fictional)"},
}


@pytest.fixture
async def zone():
    zone = Zone()
    loop = asyncio.get_running_loop()
    transport, _ = await loop.create_datagram_endpoint(lambda: _Protocol(zone), local_addr=("127.0.0.1", 0))
    zone.address = f"127.0.0.1:{transport.get_extra_info('sockname')[1]}"
    yield zone
    transport.close()


@pytest.fixture
async def client(zone):
    async with isolated_schema(alembic_ini=ALEMBIC_INI) as schema:
        settings = Settings(
            database_url=TEST_DATABASE_URL,
            db_search_path=schema,
            environment="test",
            demo_mode=True,
            dns_resolver=zone.address,
        )
        app = build_app(settings)
        with TestClient(app) as c:
            app.state.outbox.publisher = app.state.test_publisher = RecordingPublisher()
            yield c


def sent(client, event_type):
    return [e for e in client.app.state.test_publisher.sent if e["type"] == f"agesoa.{event_type}"]


def register(client, headers=ADMIN, **changes):
    return client.post("/v1/organizations", json={**NEWSROOM, **changes}, headers=headers)


async def check(client, org_id, headers=ADMIN):
    # The test DNS server runs on this event loop: the (blocking) test client call runs in a thread.
    response = await asyncio.to_thread(client.post, f"/v1/organizations/{org_id}/dns-check", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


async def test_txt_record_verifies_the_domain_only_with_the_right_token(client, zone):
    created = register(client)
    assert created.status_code == 201, created.text
    org = created.json()
    assert (
        org["domain"] == "warta.example.org" and org["status"] == "awaiting_dns" and org["synthetic"] is True
    )
    assert org["txt_record"].startswith("agesoa-verify=") and len(org["txt_record"]) > 30

    # 1. no record, 2. wrong token: still awaiting DNS
    assert (await check(client, org["organization_id"]))["result"] == "no_record"
    zone.txt["warta.example.org"] = ["v=spf1 -all", "agesoa-verify=not-the-token"]
    second = await check(client, org["organization_id"])
    assert second["result"] == "token_mismatch" and second["organization"]["status"] == "awaiting_dns"
    assert sent(client, "organisasi.terverifikasi") == []

    # 3. the right token: verified, announced, logged
    zone.txt["warta.example.org"] = ["v=spf1 -all", org["txt_record"]]
    third = await check(client, org["organization_id"])
    assert third["result"] == "verified" and third["organization"]["status"] == "verified"
    assert third["organization"]["verified_at"]
    (verified,) = sent(client, "organisasi.terverifikasi")
    validate_event(verified)
    assert verified["data"]["method"] == "dns_txt" and verified["data"]["domain"] == "warta.example.org"
    decisions = sent(client, "keputusan.dicatat")
    for d in decisions:
        validate_event(d)
        assert org["txt_record"] not in json.dumps(d)  # the token itself is never published
    assert [d["data"]["action"] for d in decisions] == [
        "organization.dns_check_failed",
        "organization.dns_check_failed",
        "organization.verified",
    ]
    assert (await check(client, org["organization_id"]))["result"] == "already_verified"
    assert len(sent(client, "organisasi.terverifikasi")) == 1


def test_only_organization_admins_see_their_own_organizations(client):
    org = register(client).json()
    assert register(client, headers=VALIDATOR).status_code == 403
    assert client.post("/v1/organizations", json=NEWSROOM).status_code == 401
    assert client.get(f"/v1/organizations/{org['organization_id']}", headers=OTHER_ADMIN).status_code == 404
    assert client.get("/v1/organizations", headers=OTHER_ADMIN).json() == []
    assert [o["organization_id"] for o in client.get("/v1/organizations", headers=ADMIN).json()] == [
        org["organization_id"]
    ]
    assert register(client, headers=OTHER_ADMIN).status_code == 409  # same domain


@pytest.mark.parametrize("domain", ["localhost", "not a domain", "-bad.example.org", "x" * 300 + ".org"])
def test_domains_are_validated(client, domain):
    assert register(client, domain=domain).status_code == 422


def test_demo_org_admin_account_is_seeded_with_its_role():
    accounts = json.loads(DEMO_FILE.read_text(encoding="utf-8"))["accounts"]
    assert {
        "auth_uid": "demo-org-admin-1",
        "email": "org-admin@demo.agesoa.local",
        "roles": ["org_admin"],
    } in accounts
