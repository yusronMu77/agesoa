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
    data = json.loads((EXAMPLES / "finding.ready_for_validation.json").read_text(encoding="utf-8"))["data"]
    data = {**data, "finding_id": finding_id, **changes}
    return new_event("finding.ready_for_validation", source="case-audit", subject=data["case_id"], data=data)


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
    assert client.post("/events/finding.ready_for_validation", json=push_envelope(event)).status_code == 204
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
    assert sent(client, "validation.completed") == []

    second = decide(client, NUTRITIONIST).json()
    assert second["quorum_reached"] is True and second["outcome"] == "approved"
    after = client.get("/v1/validation-requests/F-1", headers=JOURNALIST).json()
    assert after["outcome"] == "approved" and after["completed_at"]

    (done,) = sent(client, "validation.completed")
    validate_event(done)
    assert done["data"]["outcome"] == "approved"
    assert {d["tier"] for d in done["data"]["decisions"]} == {"high", "medium"}
    # every vote and the quorum outcome reach the decision log (through transparency)
    decisions = sent(client, "decision.recorded")
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


def test_validators_get_the_statement_in_both_languages_when_the_producer_wrote_them(client):
    both = {"id": "Satu dapur melayani 34 sekolah.", "en": "One kitchen serves 34 schools."}
    open_finding(client, "F-1", statement_i18n=both)
    open_finding(client, "F-2")  # an older producer: plain statement only
    detail = client.get("/v1/validation-requests/F-1", headers=JOURNALIST).json()
    assert detail["statement_i18n"] == both
    listed = {r["finding_id"]: r for r in client.get("/v1/validation-requests", headers=JOURNALIST).json()}
    assert listed["F-1"]["statement_i18n"] == both
    assert listed["F-2"]["statement_i18n"] is None
    assert listed["F-2"]["statement"]


def test_a_rejection_returns_the_finding_to_the_audit(client):
    open_finding(client)
    body = decide(client, JOURNALIST, "reject", note="Timestamps do not match.").json()
    assert body["outcome"] == "rejected"
    (done,) = sent(client, "validation.completed")
    assert done["data"]["outcome"] == "rejected"
    vote, quorum = (d["data"] for d in sent(client, "decision.recorded"))
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
    assert sent(client, "decision.recorded") == []


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
    assert "not counted" in sent(client, "decision.recorded")[0]["data"]["reason"]


def test_redelivered_finding_is_opened_once(client):
    event = open_finding(client)
    assert client.post("/events/finding.ready_for_validation", json=push_envelope(event)).status_code == 204
    assert len(client.get("/v1/validation-requests", headers=JOURNALIST).json()) == 1


async def test_demo_validators_only_with_demo_mode():
    async with isolated_schema(alembic_ini=ALEMBIC_INI) as schema:
        settings = Settings(database_url=TEST_DATABASE_URL, db_search_path=schema, environment="test")
        app = build_app(settings)
        with TestClient(app) as client:
            client.post("/events/finding.ready_for_validation", json=push_envelope(finding()))
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
    (done,) = sent(client, "validation.completed")
    validate_event(done)
    assert [(d["role_label"], d["regency_name"]) for d in done["data"]["decisions"]] == [
        ("Journalist", "Kabupaten Sukamaju (fictional)"),
        ("Nutritionist", "Kabupaten Sukamaju (fictional)"),
    ]


# --- needs_evidence ("Butuh bukti") ------------------------------------------------------------------------


def test_asking_for_evidence_is_logged_but_never_counted(client):
    open_finding(client)
    asked = decide(client, JOURNALIST, "needs_evidence", note="Lab result of the food sample is missing.")
    assert asked.status_code == 201, asked.text
    body = asked.json()
    assert body["decision"] == "needs_evidence" and body["counted"] is True
    assert body["quorum_reached"] is False and body["outcome"] is None and body["state"] == "needs_evidence"
    assert body["quorum"]["approvals"] == 0 and body["quorum"]["evidence_requests"] == 1

    detail = client.get("/v1/validation-requests/F-1", headers=JOURNALIST).json()
    assert detail["state"] == "needs_evidence" and detail["my_decision"] == "needs_evidence"
    assert detail["outcome"] is None
    (listed,) = client.get("/v1/validation-requests", headers=NUTRITIONIST).json()
    assert listed["state"] == "needs_evidence" and listed["evidence_requests"] == 1
    assert listed["my_decision"] is None

    (vote,) = (d["data"] for d in sent(client, "decision.recorded"))
    assert vote["action"] == "finding.evidence_requested" and vote["status_label"] == "supported"
    assert vote["reason"] == (
        "Validator asked for more evidence before deciding (not counted toward quorum). "
        "Note: Lab result of the food sample is missing."
    )
    assert sent(client, "validation.completed") == []
    progress = sent(client, "validation.updated")
    for event in progress:
        validate_event(event)
    assert [p["data"]["state"] for p in progress] == ["awaiting_decisions", "needs_evidence"]
    assert "validator_ref" not in json.dumps(progress)


def test_a_later_approval_replaces_the_request_for_evidence(client):
    open_finding(client)
    decide(client, JOURNALIST, "needs_evidence", note="Need the kitchen log.")
    assert decide(client, JOURNALIST, "needs_evidence", note="Again.").status_code == 409
    replaced = decide(client, JOURNALIST, "approve", note="Kitchen log received.").json()
    assert replaced["replaced"] is True and replaced["state"] == "awaiting_decisions"
    assert replaced["quorum"] == {
        "outcome": "pending",
        "reason": replaced["quorum"]["reason"],
        "approvals": 1,
        "rejections": 0,
        "evidence_requests": 0,
    }
    assert decide(client, JOURNALIST, "reject").status_code == 409  # approve/reject are final
    assert decide(client, NUTRITIONIST).json()["outcome"] == "approved"
    actions = [d["data"]["action"] for d in sent(client, "decision.recorded")]
    assert actions == [
        "finding.evidence_requested",
        "finding.approved",
        "finding.approved",
        "finding.validated",
    ]
    assert (
        "replacing their request for more evidence" in sent(client, "decision.recorded")[1]["data"]["reason"]
    )
    (done,) = sent(client, "validation.completed")
    assert [d["decision"] for d in done["data"]["decisions"]] == ["approve", "approve"]


def test_an_outstanding_evidence_request_does_not_block_or_join_the_outcome(client):
    open_finding(client)
    decide(client, AGENCY_STAFF, "needs_evidence", note="Need the delivery note.", finding_id="F-1")
    # the agency is named in the finding: its staff is refused before anything is recorded
    assert sent(client, "decision.recorded") == []
    open_finding(client, "F-2", parties_mentioned=[])
    assert (
        decide(client, AGENCY_STAFF, "needs_evidence", note="Need the note.", finding_id="F-2").status_code
        == 201
    )
    decide(client, JOURNALIST, finding_id="F-2")
    assert decide(client, NUTRITIONIST, finding_id="F-2").json()["outcome"] == "approved"
    (done,) = sent(client, "validation.completed")
    validate_event(done)
    assert [d["decision"] for d in done["data"]["decisions"]] == ["approve", "approve"]


def test_asking_for_evidence_needs_a_note(client):
    open_finding(client)
    assert decide(client, JOURNALIST, "needs_evidence").status_code == 422
    assert decide(client, JOURNALIST, "needs_evidence", note="  ").status_code == 422
    assert sent(client, "decision.recorded") == []


# --- deadline (Tenggat) -------------------------------------------------------------------------------------


def open_at(client, finding_id, time, **changes):
    event = finding(finding_id, **changes)
    event["time"] = time
    assert client.post("/events/finding.ready_for_validation", json=push_envelope(event)).status_code == 204


def test_queue_is_sorted_by_the_pack_deadline(client):
    open_at(client, "F-LATE", "2026-10-14T00:00:00Z")  # mbg: 72 h -> 2026-10-17
    open_at(client, "F-SOON", "2026-10-13T00:00:00Z")
    open_at(client, "F-GENERAL", "2026-10-10T00:00:00Z", domain="general")  # 120 h -> 2026-10-15
    open_at(client, "F-NONE", "2026-10-01T00:00:00Z", domain="unknown-pack")  # no pack: no deadline
    listed = client.get("/v1/validation-requests", headers=JOURNALIST).json()
    assert [(r["finding_id"], r["deadline_at"]) for r in listed] == [
        ("F-GENERAL", "2026-10-15T00:00:00Z"),
        ("F-SOON", "2026-10-16T00:00:00Z"),
        ("F-LATE", "2026-10-17T00:00:00Z"),
        ("F-NONE", None),
    ]
    detail = client.get("/v1/validation-requests/F-SOON", headers=JOURNALIST).json()
    assert detail["deadline_at"] == "2026-10-16T00:00:00Z"
    client.portal.call(client.app.state.outbox.dispatch)  # what the sweep does within a minute
    opened = {e["data"]["finding_id"]: e["data"] for e in sent(client, "validation.updated")}
    assert opened["F-SOON"]["deadline_at"] == "2026-10-16T00:00:00Z"
    assert opened["F-SOON"]["state"] == "awaiting_decisions"
    assert opened["F-NONE"]["deadline_at"] is None


def test_deadline_counts_from_the_ready_time_in_utc(client):
    open_at(client, "F-1", "2026-10-14T10:00:00+07:00")
    detail = client.get("/v1/validation-requests/F-1", headers=JOURNALIST).json()
    assert detail["deadline_at"] == "2026-10-17T03:00:00Z"


def test_a_naive_ready_time_never_opens_a_validation(client):
    event = finding("F-NAIVE")
    event["time"] = "2026-10-14T10:00:00"
    assert client.post("/events/finding.ready_for_validation", json=push_envelope(event)).status_code == 400
    assert client.get("/v1/validation-requests/F-NAIVE", headers=JOURNALIST).status_code == 404


def test_opening_a_validation_publishes_its_progress_without_waiting_for_the_sweep(client):
    open_finding(client)
    client.portal.call(client.app.state.outbox_flush.wait_idle)  # no sweep, no API request
    (opened,) = sent(client, "validation.updated")
    validate_event(opened)
    assert opened["data"]["state"] == "awaiting_decisions" and opened["data"]["deadline_at"]
    # a redelivered finding opens nothing new and publishes nothing new
    client.post("/events/finding.ready_for_validation", json=push_envelope(finding()))
    client.portal.call(client.app.state.outbox_flush.wait_idle)
    assert len(sent(client, "validation.updated")) == 1
