"""Institution webhooks + institution API against Postgres (TEST_DATABASE_URL); the institution's receiver is mocked."""

import json
import time
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest
from agesoa_contracts import validate_event, validate_webhook_body
from agesoa_delivery.events import organization_verified, validation_completed
from agesoa_delivery.main import build_app
from agesoa_delivery.settings import Settings
from agesoa_platform.hmac import verify_webhook
from agesoa_platform.testing import TEST_DATABASE_URL, RecordingPublisher, isolated_schema
from fastapi.testclient import TestClient

pytestmark = pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL not set")
ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"
AGENCY = "ORG-DEMO-AGENCY"
ADMIN = {"Authorization": "Bearer dev:agency-admin:org_admin"}
OTHER_ADMIN = {"Authorization": "Bearer dev:other-admin:org_admin"}
NEWSROOM_ADMIN = {"Authorization": "Bearer dev:news-admin:org_admin"}
REPORT = {
    "case_id": "CASE-DEMO-1",
    "category": "food_poisoning",
    "summary": "Repeated poisoning traced to a long delivery route (fictional).",
    "root_causes": [
        {
            "statement": "Food waits over 4 hours before serving",
            "status": "supported",
            "evidence_refs": ["E-1"],
        }
    ],
    "recommendations": ["Shorten the delivery route"],
    "region": {"regency_code": None, "regency_name": "Kabupaten Sukamaju (fictional)"},
}


class Receiver:
    """The institution's webhook endpoint: answers from a script of status codes (then 200)."""

    def __init__(self, script=()):
        self.script = list(script)
        self.calls = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request)
        code = self.script.pop(0) if self.script else 200
        if code == 200:
            return httpx.Response(200, json={"internal_ticket": f"SIM-{len(self.calls)}"})
        return httpx.Response(code, json={"error": "down"})


def organization_event(org_id, kind, admin):
    return {
        "id": f"ev-{org_id}",
        "type": "agesoa.organisasi.terverifikasi",
        "data": {
            "organization_id": org_id,
            "name": f"{org_id} (fictional)",
            "kind": kind,
            "domain": "example.test",
            "method": "seed",
            "verified_at": "2026-10-16T00:00:00Z",
            "synthetic": True,
            "admin_ref": admin,
        },
    }


@pytest.fixture
def receiver():
    return Receiver()


@pytest.fixture
async def client(receiver):
    async with isolated_schema(alembic_ini=ALEMBIC_INI) as schema:
        settings = Settings(
            database_url=TEST_DATABASE_URL,
            db_search_path=schema,
            environment="test",
            demo_mode=True,
            webhook_retry_delays="0.05,0.1,0.15",
            portal_url="https://portal.example",
        )
        app = build_app(settings)
        app.state.webhook_client = httpx.AsyncClient(transport=httpx.MockTransport(receiver))
        with TestClient(app) as c:
            app.state.outbox.publisher = app.state.test_publisher = RecordingPublisher()

            async def seed():
                async with app.state.db.transaction() as session:
                    await organization_verified(session, organization_event(AGENCY, "agency", "agency-admin"))
                    await organization_verified(
                        session, organization_event("ORG-NEWS", "newsroom", "news-admin")
                    )
                    await organization_verified(
                        session, organization_event("ORG-OTHER", "agency", "other-admin")
                    )

            c.portal.call(seed)
            yield c


def sent(client, event_type):
    return [e for e in client.app.state.test_publisher.sent if e["type"] == f"agesoa.{event_type}"]


def subscribe(client, headers=ADMIN, org=AGENCY, **extra):
    return client.put(
        f"/v1/institutions/{org}/subscription",
        json={"webhook_url": "http://sim.example/webhook", **extra},
        headers=headers,
    )


def history(client, org=AGENCY, headers=ADMIN, until=lambda d: d and d[0]["status"] != "pending"):
    deadline = time.monotonic() + 10
    while True:
        rows = client.get(f"/v1/institutions/{org}/deliveries", headers=headers).json()
        if until(rows) or time.monotonic() > deadline:
            return rows
        time.sleep(0.05)


def test_test_event_is_signed_and_recorded(client, receiver):
    """TC-113 (sender side) + TC-116 (API part)."""
    created = subscribe(client)
    assert created.status_code == 200, created.text
    secret = created.json()["secret"]
    assert secret.startswith("whsec_")
    assert "secret" not in json.dumps(client.get(f"/v1/institutions/{AGENCY}", headers=ADMIN).json())

    queued = client.post(f"/v1/institutions/{AGENCY}/test-event", headers=ADMIN)
    assert queued.status_code == 202
    (row,) = history(client)
    assert row["status"] == "delivered" and row["event"] == "test_event" and row["internal_ticket"] == "SIM-1"
    assert [(a["attempt"], a["http_status"]) for a in row["attempts"]] == [(1, 200)]

    (request,) = receiver.calls
    body = request.content
    assert request.headers["x-agesoa-event"] == "test_event"
    assert request.headers["x-agesoa-event-id"] == queued.json()["event_id"]
    assert verify_webhook(
        secret, request.headers["x-agesoa-timestamp"], request.headers["x-agesoa-signature"], body
    )
    assert not verify_webhook(
        "wrong", request.headers["x-agesoa-timestamp"], request.headers["x-agesoa-signature"], body
    )
    validate_webhook_body(json.loads(body))
    assert sent(client, "laporan_audit.dikirim") == []  # a test event is not a delivered report


@pytest.mark.parametrize("receiver", [Receiver([500, 503])], indirect=False)
def test_failed_delivery_is_retried_with_the_same_event_id(client, receiver):
    """TC-115: the receiver recovers after the 2nd attempt; no further attempt after the success."""
    subscribe(client)
    client.post(f"/v1/institutions/{AGENCY}/test-event", headers=ADMIN)
    (row,) = history(client)
    assert row["status"] == "delivered"
    assert [(a["attempt"], a["http_status"]) for a in row["attempts"]] == [(1, 500), (2, 503), (3, 200)]
    assert len({r.headers["x-agesoa-event-id"] for r in receiver.calls}) == 1
    time.sleep(0.4)
    assert len(receiver.calls) == 3


@pytest.mark.parametrize("receiver", [Receiver([500] * 10)], indirect=False)
def test_delivery_gives_up_after_three_retries(client, receiver):
    subscribe(client)
    client.post(f"/v1/institutions/{AGENCY}/test-event", headers=ADMIN)
    (row,) = history(client)
    assert row["status"] == "failed" and len(row["attempts"]) == 4
    time.sleep(0.4)
    assert len(receiver.calls) == 4


def test_only_the_agency_admin_manages_its_webhook(client):
    assert subscribe(client, headers=OTHER_ADMIN).status_code == 404
    assert (
        subscribe(client, headers=NEWSROOM_ADMIN, org="ORG-NEWS").status_code == 404
    )  # newsrooms: no webhooks
    validator = {"Authorization": "Bearer dev:agency-admin:validator"}
    assert subscribe(client, headers=validator).status_code == 403
    assert client.post(f"/v1/institutions/{AGENCY}/test-event", headers=ADMIN).status_code == 409  # none yet
    mine = client.get("/v1/institutions/mine", headers=ADMIN).json()
    assert [m["organization_id"] for m in mine] == [AGENCY]


def test_api_key_is_shown_once_and_required(client):
    """TC-117."""
    created = client.post(f"/v1/institutions/{AGENCY}/api-key", headers=ADMIN)
    assert created.status_code == 201
    key = created.json()["api_key"]
    shown = client.get(f"/v1/institutions/{AGENCY}", headers=ADMIN).json()
    assert shown["api_key"]["prefix"] == key[:10] and key not in json.dumps(shown)
    body = {"status": "received", "note": "qa"}
    url = "/api/v1/cases/CASE-DEMO-1/status"
    assert client.post(url, json=body).status_code == 401
    assert client.post(url, json=body, headers={"Authorization": "Bearer agk_wrong"}).status_code == 401
    # a valid key, but nothing was delivered to this institution for that case
    assert client.post(url, json=body, headers={"Authorization": f"Bearer {key}"}).status_code == 404
    # a new key replaces the old one
    client.post(f"/v1/institutions/{AGENCY}/api-key", headers=ADMIN)
    assert client.post(url, json=body, headers={"Authorization": f"Bearer {key}"}).status_code == 401


def test_demo_report_carries_its_text_in_both_languages_only_in_the_event(client, receiver):
    report = {
        **REPORT,
        "case_id": "CASE-DEMO-I18N",
        "summary_i18n": {"id": "Ringkasan (fiktif)", "en": "Summary (fictional)"},
        "root_causes": [{**REPORT["root_causes"][0], "statement_i18n": {"id": "Akar masalah (fiktif)"}}],
        "recommendations": ["Shorten the route"],
        "recommendations_i18n": [{"id": "Perpendek rute", "en": "Shorten the route"}],
    }
    created = client.post("/internal/demo/audit-reports", json=report)
    assert created.status_code == 201, created.text
    (dibuat,) = [e for e in sent(client, "laporan_audit.dibuat") if e["data"]["case_id"] == "CASE-DEMO-I18N"]
    validate_event(dibuat)
    data = dibuat["data"]
    assert data["summary_i18n"] == {"id": "Ringkasan (fiktif)", "en": "Summary (fictional)"}
    assert data["root_causes"][0]["statement_i18n"] == {"id": "Akar masalah (fiktif)"}
    assert data["recommendations_i18n"] == [{"id": "Perpendek rute", "en": "Shorten the route"}]


def test_demo_report_languages_are_checked(client):
    base = {**REPORT, "case_id": "CASE-DEMO-BAD", "recommendations": ["One"]}
    assert client.post("/internal/demo/audit-reports", json={**base, "summary_i18n": {}}).status_code == 422
    assert (
        client.post("/internal/demo/audit-reports", json={**base, "summary_i18n": {"fr": "x"}}).status_code
        == 422
    )
    two = [{"id": "Satu"}, {"id": "Dua"}]
    assert (
        client.post("/internal/demo/audit-reports", json={**base, "recommendations_i18n": two}).status_code
        == 422
    )


def test_delivered_report_then_follow_up_and_right_of_reply(client, receiver):
    """TC-113 (audit report) + TC-118 + TC-119 (API part) + TC-120."""

    async def validated():
        async with client.app.state.db.transaction() as session:
            await validation_completed(
                session,
                {
                    "data": {
                        "case_id": REPORT["case_id"],
                        "outcome": "approved",
                        "completed_at": datetime.now(UTC).isoformat(),
                        "decisions": [
                            {"decision": "approve", "role_label": "Journalist", "regency_name": "Sukamaju"},
                            {"decision": "approve", "role_label": "Nutritionist", "regency_name": None},
                        ],
                    }
                },
            )

    client.portal.call(validated)
    subscribe(client)
    subscribe(client, headers=OTHER_ADMIN, org="ORG-OTHER", category="other_category")  # does not match
    key = client.post(f"/v1/institutions/{AGENCY}/api-key", headers=ADMIN).json()["api_key"]
    other_key = client.post("/v1/institutions/ORG-OTHER/api-key", headers=OTHER_ADMIN).json()["api_key"]

    created = client.post("/internal/demo/audit-reports", json=REPORT)
    assert created.status_code == 201, created.text
    assert len(created.json()["deliveries"]) == 1
    (row,) = history(client)
    assert row["status"] == "delivered" and row["event"] == "audit_report.final"
    body = json.loads(receiver.calls[0].content)
    validate_webhook_body(body)
    assert body["case"]["validations"] == ["Journalist, Sukamaju", "Nutritionist"]
    assert body["case"]["url"] == "https://portal.example/cases/CASE-DEMO-1"
    assert body["case"]["root_causes"][0]["evidence"] == ["E-1"]
    (dikirim,) = sent(client, "laporan_audit.dikirim")
    validate_event(dikirim)
    actions = [e["data"]["action"] for e in sent(client, "keputusan.dicatat")]
    assert actions == ["audit_report.delivered"]
    assert client.post("/internal/demo/audit-reports", json=REPORT).status_code == 409

    auth = {"Authorization": f"Bearer {key}"}
    url = f"/api/v1/cases/{REPORT['case_id']}/status"
    for state in ("received", "in_progress", "done"):
        r = client.post(
            url, json={"status": state, "note": f"now {state}", "internal_ticket": "SIM-1"}, headers=auth
        )
        assert r.status_code == 202, r.text
    assert client.post(url, json={"status": "lost"}, headers=auth).status_code == 422
    assert (
        client.post(
            url, json={"status": "done"}, headers={"Authorization": f"Bearer {other_key}"}
        ).status_code
        == 404
    )
    updates = sent(client, "tindak_lanjut.diperbarui")
    assert [e["data"]["status"] for e in updates] == ["received", "in_progress", "done"]

    reply = client.post(
        f"/api/v1/cases/{REPORT['case_id']}/reply", json={"body": "We replaced the supplier."}, headers=auth
    )
    assert reply.status_code == 202
    (hak_jawab,) = sent(client, "hak_jawab.diterima")
    assert hak_jawab["data"]["body"] == "We replaced the supplier."
    for event in sent(client, "keputusan.dicatat") + updates + [hak_jawab]:
        validate_event(event)
    assert [e["data"]["action"] for e in sent(client, "keputusan.dicatat")] == [
        "audit_report.delivered",
        "follow_up.updated",
        "follow_up.updated",
        "follow_up.updated",
        "right_of_reply.received",
    ]
    # TC-120: no institution endpoint changes a finding or a report
    for method in ("put", "patch", "delete"):
        assert getattr(client, method)(f"/api/v1/cases/{REPORT['case_id']}", headers=auth).status_code in (
            404,
            405,
        )
