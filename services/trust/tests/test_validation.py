"""Validation API against a real Postgres (TEST_DATABASE_URL, isolated schema); skipped otherwise."""

import json
from pathlib import Path

import pytest
from agesoa_contracts import validate_event
from agesoa_platform.events import new_event
from agesoa_platform.testing import TEST_DATABASE_URL, RecordingPublisher, isolated_schema, push_envelope
from agesoa_trust.main import build_app
from agesoa_trust.settings import Settings
from fastapi.testclient import TestClient

pytestmark = pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL not set")
ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"
EXAMPLES = Path(__file__).resolve().parents[3] / "packages" / "contracts" / "events" / "examples"
JOURNALIST = {"Authorization": "Bearer dev:demo-validator-1:validator"}  # high tier, newsroom
NUTRITIONIST = {"Authorization": "Bearer dev:demo-validator-2:validator"}  # medium tier, independent
REPORTER = {"Authorization": "Bearer dev:reporter-1"}
AGENCY = {"Authorization": "Bearer dev:agency-1:org_admin"}
UNREGISTERED = {"Authorization": "Bearer dev:someone:validator"}


def finding(finding_id="F-1", **changes):
    data = json.loads((EXAMPLES / "temuan.siap_validasi.json").read_text(encoding="utf-8"))["data"]
    data = {**data, "finding_id": finding_id, **changes}
    return new_event("temuan.siap_validasi", source="case-audit", subject=data["case_id"], data=data)


@pytest.fixture
async def client():
    async with isolated_schema(alembic_ini=ALEMBIC_INI) as schema:
        settings = Settings(
            database_url=TEST_DATABASE_URL, db_search_path=schema, environment="test", demo_mode=True
        )
        app = build_app(settings)
        with TestClient(app) as c:
            app.state.outbox.publisher = app.state.test_publisher = RecordingPublisher()
            yield c


def open_finding(client, finding_id="F-1", **changes):
    event = finding(finding_id, **changes)
    assert client.post("/events/temuan.siap_validasi", json=push_envelope(event)).status_code == 204
    return event


def decide(client, headers, decision="approve", finding_id="F-1", **body):
    return client.post(
        f"/v1/validation-requests/{finding_id}/decisions",
        json={"decision": decision, **body},
        headers=headers,
    )


def sent(client, event_type):
    return [e for e in client.app.state.test_publisher.sent if e["type"] == f"agesoa.{event_type}"]


def test_a_finding_becomes_final_only_after_quorum(client):
    open_finding(client)
    before = client.get("/v1/validation-requests/F-1", headers=JOURNALIST).json()
    assert before["outcome"] is None and before["quorum"]["outcome"] == "pending"

    first = decide(client, JOURNALIST, note="Matches the tray labels.")
    assert first.status_code == 201, first.text
    assert first.json()["quorum_reached"] is False
    assert sent(client, "validasi.selesai") == []

    second = decide(client, NUTRITIONIST).json()
    assert second["quorum_reached"] is True and second["outcome"] == "approved"
    after = client.get("/v1/validation-requests/F-1", headers=JOURNALIST).json()
    assert after["outcome"] == "approved" and after["completed_at"]

    (done,) = sent(client, "validasi.selesai")
    validate_event(done)
    assert done["data"]["outcome"] == "approved"
    assert {d["tier"] for d in done["data"]["decisions"]} == {"high", "medium"}
    # every vote and the quorum outcome reach the decision log (through transparency)
    decisions = sent(client, "keputusan.dicatat")
    assert [d["data"]["action"] for d in decisions] == [
        "finding.approved",
        "finding.approved",
        "finding.validated",
    ]
    for d in decisions:
        validate_event(d)
        assert d["data"]["actor"]["name"] in (
            "Journalist (high tier validator)",
            "Nutritionist (medium tier validator)",
            "quorum",
        )
    assert "Matches the tray labels." in decisions[0]["data"]["reason"]


def test_a_rejection_returns_the_finding_to_the_audit(client):
    open_finding(client)
    body = decide(client, JOURNALIST, "reject", note="Timestamps do not match.").json()
    assert body["outcome"] == "rejected"
    (done,) = sent(client, "validasi.selesai")
    assert done["data"]["outcome"] == "rejected"
    vote, quorum = (d["data"] for d in sent(client, "keputusan.dicatat"))
    assert vote["action"] == "finding.rejected"
    assert (
        vote["reason"].startswith("Validator rejected the finding.")
        and "Timestamps do not match." in vote["reason"]
    )
    assert quorum["action"] == "finding.returned_to_audit" and quorum["status_label"] == "alleged"
    assert client.get("/v1/validation-requests", headers=JOURNALIST).json() == []


def test_decisions_need_a_validator(client):
    open_finding(client)
    assert decide(client, {}).status_code == 401
    assert decide(client, REPORTER).status_code == 403
    assert decide(client, AGENCY).status_code == 403
    assert decide(client, UNREGISTERED).status_code == 403  # validator role but no active registration
    assert client.get("/v1/validation-requests/F-1", headers=JOURNALIST).json()["quorum"]["approvals"] == 0
    assert sent(client, "keputusan.dicatat") == []


def test_one_decision_per_validator_and_none_after_closing(client):
    open_finding(client)
    assert decide(client, JOURNALIST).status_code == 201
    assert decide(client, JOURNALIST).status_code == 409
    assert decide(client, NUTRITIONIST).status_code == 201
    assert decide(client, NUTRITIONIST, finding_id="F-1").status_code == 409  # closed
    assert decide(client, JOURNALIST, finding_id="NOPE").status_code == 404


def test_the_audited_party_cannot_validate(client):
    open_finding(client, parties_mentioned=["Redaksi Sukamaju (fictional)"])
    response = decide(client, JOURNALIST)
    assert response.status_code == 409
    assert "named in this finding" in response.json()["detail"]


def test_declared_conflict_is_logged_but_not_counted(client):
    open_finding(client)
    body = decide(client, JOURNALIST, conflict=True).json()
    assert body["counted"] is False
    assert decide(client, NUTRITIONIST).json()["quorum_reached"] is False
    assert "not counted" in sent(client, "keputusan.dicatat")[0]["data"]["reason"]


def test_redelivered_finding_is_opened_once(client):
    event = open_finding(client)
    assert client.post("/events/temuan.siap_validasi", json=push_envelope(event)).status_code == 204
    assert len(client.get("/v1/validation-requests", headers=JOURNALIST).json()) == 1


async def test_demo_validators_only_with_demo_mode():
    async with isolated_schema(alembic_ini=ALEMBIC_INI) as schema:
        settings = Settings(database_url=TEST_DATABASE_URL, db_search_path=schema, environment="test")
        app = build_app(settings)
        with TestClient(app) as client:
            client.post("/events/temuan.siap_validasi", json=push_envelope(finding()))
            assert decide(client, JOURNALIST).status_code == 403


def test_my_profile_shows_role_label_and_tier(client):
    me = client.get("/v1/validators/me", headers=JOURNALIST).json()
    assert me == {
        "validator_id": "VAL-DEMO-1",
        "role": "journalist",
        "role_label": "Journalist",
        "tier": "high",
        "status": "active",
        "organization": "Redaksi Sukamaju (fictional)",
        "region": me["region"],
        "synthetic": True,
        "path": "org_confirmed",
        "probation": False,  # seeded demo validators are established, not new
        "confidence": None,
        "rejection_reason": None,
    }
    assert client.get("/v1/validators/me", headers=UNREGISTERED).status_code == 403
    assert client.get("/v1/validators/me", headers=REPORTER).status_code == 403


AGENCY_STAFF = {
    "Authorization": "Bearer dev:demo-validator-3:validator"
}  # high tier, agency named in the example


def queue(client, headers):
    response = client.get("/v1/validation-requests", headers=headers)
    assert response.status_code == 200, response.text
    return [r["finding_id"] for r in response.json()]


def test_findings_are_routed_by_role_regency_and_conflict(client):
    open_finding(client, "F-NAMED")  # names the agency; asks nutritionist + journalist
    open_finding(client, "F-ANY", required_roles=[], parties_mentioned=[])
    other = {"regency_code": None, "regency_name": "Kabupaten Lain (fictional)", "district_code": None}
    open_finding(
        client, "F-OTHER", required_roles=[], parties_mentioned=[], region={**other, "district_name": None}
    )
    assert queue(client, JOURNALIST) == ["F-NAMED", "F-ANY"]
    assert queue(client, NUTRITIONIST) == ["F-NAMED", "F-ANY"]
    # TC-110: the audited agency's staff is never routed to a finding that names the agency
    assert queue(client, AGENCY_STAFF) == ["F-ANY"]
    assert decide(client, AGENCY_STAFF, finding_id="F-NAMED").status_code == 409
    assert client.get("/v1/validation-requests", headers=UNREGISTERED).status_code == 403


def test_completed_validation_names_roles_and_regency_not_people(client):
    open_finding(client)
    decide(client, JOURNALIST)
    decide(client, NUTRITIONIST)
    (done,) = sent(client, "validasi.selesai")
    validate_event(done)
    assert [(d["role_label"], d["regency_name"]) for d in done["data"]["decisions"]] == [
        ("Journalist", "Kabupaten Sukamaju (fictional)"),
        ("Nutritionist", "Kabupaten Sukamaju (fictional)"),
    ]
