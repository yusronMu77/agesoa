"""Grouping reports and signals into cases through the event handlers, against a real Postgres
(TEST_DATABASE_URL, isolated schema); skipped otherwise."""

import json
from pathlib import Path

import pytest
from agesoa_case_audit.main import build_app
from agesoa_case_audit.settings import Settings
from agesoa_contracts import validate_event
from agesoa_platform.events import new_event
from agesoa_platform.testing import TEST_DATABASE_URL, RecordingPublisher, isolated_schema, push_envelope
from fastapi.testclient import TestClient

pytestmark = pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL not set")
ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"
EXAMPLES = Path(__file__).resolve().parents[3] / "packages" / "contracts" / "events" / "examples"
VALIDATOR = {"Authorization": "Bearer dev:demo-validator-1:validator"}
OTHER_REGENCY = {"regency_code": None, "regency_name": "Kabupaten Lain (fictional)"}


def example(name: str) -> dict:
    return json.loads((EXAMPLES / f"{name}.json").read_text(encoding="utf-8"))["data"]


NOW = "2026-10-14T03:15:00Z"  # fixed: the evidence status of a case is evaluated at the event time


def at(event: dict, time: str = NOW) -> dict:
    return {**event, "time": time}


def report_event(report_id="R-1", *, fields=None, received_at=NOW, **changes):
    data = {**example("laporan.diterima"), "report_id": report_id, "received_at": received_at, **changes}
    if fields:
        data["fields"] = {**data["fields"], **fields}
    return at(new_event("laporan.diterima", source="ingestion", subject=report_id, data=data), received_at)


def signal_event(signal_id="S-1", **changes):
    data = {**example("sinyal.diterima"), "signal_id": signal_id, **changes}
    return at(new_event("sinyal.diterima", source="ingestion", subject=signal_id, data=data))


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


def deliver(client, event):
    event_type = event["type"].removeprefix("agesoa.")
    response = client.post(f"/events/{event_type}", json=push_envelope(event))
    assert response.status_code == 204, response.text
    client.portal.call(client.app.state.outbox.dispatch)  # what the sweep does within a minute


def sent(client, event_type):
    return [e for e in client.app.state.test_publisher.sent if e["type"] == f"agesoa.{event_type}"]


def cases(client):
    return client.get("/v1/cases", headers=VALIDATOR).json()


def test_a_first_report_opens_a_case_with_its_evidence_deadline(client):
    deliver(client, report_event("R-1"))

    (case,) = cases(client)
    assert case["status"] == "open" and case["domain"] == "mbg" and case["category"] == "poisoning"
    assert case["evidence_deadline_at"].startswith("2026-10-15T22:00:00")  # 48 h after the tray label time
    assert case["evidence_status"] == "available" and case["max_finding_status"] == "proven"
    assert case["synthetic"] is True

    (update,) = sent(client, "kasus.diperbarui")
    validate_event(update)
    assert update["data"]["case_id"] == case["id"]
    assert update["data"]["report_ids"] == ["R-1"] and update["data"]["signal_ids"] == []


def test_a_matching_report_joins_the_case_and_a_different_one_opens_another(client):
    """TC-015: match -> added to the existing case; no match -> a new case; kasus.diperbarui for each."""
    deliver(client, report_event("R-1"))
    deliver(client, report_event("R-2", fields={"cooked_at": "2026-10-14T01:00:00Z"}))  # 3 h later
    deliver(client, report_event("R-3", region=OTHER_REGENCY))
    deliver(client, report_event("R-4", category="spoiled_food"))

    assert len(cases(client)) == 3
    updates = sent(client, "kasus.diperbarui")
    assert len(updates) == 4
    joined = [u for u in updates if u["data"]["case_id"] == updates[0]["data"]["case_id"]]
    assert [u["data"]["report_ids"] for u in joined] == [["R-1"], ["R-1", "R-2"]]
    for update in updates:
        validate_event(update)


def test_a_signal_joins_a_report_case_of_the_same_regency_within_the_window(client):
    deliver(client, report_event("R-1"))
    deliver(
        client, signal_event("S-1", occurred_on="2026-10-12", region=example("laporan.diterima")["region"])
    )

    (case,) = cases(client)
    last = sent(client, "kasus.diperbarui")[-1]["data"]
    assert last["case_id"] == case["id"]
    assert last["report_ids"] == ["R-1"] and last["signal_ids"] == ["S-1"]
    # the signal's incident day (11 Oct 17:00 UTC + 48 h) is earlier than the report's: the earlier deadline governs
    assert case["evidence_deadline_at"].startswith("2026-10-13T17:00:00")
    assert case["evidence_status"] == "likely_lost"  # evaluated at the event time (14 Oct): window closed
    assert case["max_finding_status"] == "supported"


def test_a_report_after_the_deadline_caps_the_case_at_supported(client):
    late = report_event(
        "R-1", received_at="2026-10-16T03:00:00Z"
    )  # tray label 13 Oct 22:00 UTC + 48 h = 15 Oct 22:00

    deliver(client, late)

    (case,) = cases(client)
    assert case["evidence_status"] == "likely_lost" and case["max_finding_status"] == "supported"


def test_a_report_without_any_incident_time_has_unknown_evidence_status(client):
    data = example("laporan.diterima")
    data["fields"] = {"school": "SDN Contoh (fictional)", "symptoms": ["nausea"]}
    event = new_event(
        "laporan.diterima", source="ingestion", subject="R-1", data={**data, "report_id": "R-1"}
    )
    deliver(client, at(event))

    (case,) = cases(client)
    assert case["evidence_status"] == "unknown" and case["evidence_deadline_at"] is None
    assert case["max_finding_status"] == "proven"


def test_a_report_without_a_known_regency_never_joins_a_case(client):
    deliver(client, report_event("R-1", region=None))
    deliver(client, report_event("R-2", region=None))

    assert len(cases(client)) == 2


def test_a_redelivered_event_changes_nothing(client):
    event = report_event("R-1")
    deliver(client, event)
    deliver(client, event)

    assert len(cases(client)) == 1
    assert len(sent(client, "kasus.diperbarui")) == 1


def test_a_domain_this_deployment_does_not_have_is_acknowledged_without_a_case(client):
    deliver(client, report_event("R-1", domain="roads"))

    assert cases(client) == []


def test_every_step_reaches_the_decision_log_without_names(client):
    deliver(client, report_event("R-1"))
    deliver(client, report_event("R-2", fields={"cooked_at": "2026-10-14T01:00:00Z"}))

    decisions = sent(client, "keputusan.dicatat")
    actions = [d["data"]["action"] for d in decisions]
    assert actions == ["case.opened", "case.deadline_set", "case.source_added", "case.deadline_set"]
    for decision in decisions:
        validate_event(decision)
        assert decision["data"]["actor"] == {
            "kind": "rule",
            "name": decision["data"]["actor"]["name"],
            "service": "case-audit",
        }
        assert decision["data"]["subject"]["kind"] == "case"
    assert decisions[0]["data"]["evidence_refs"] == ["E-12"]
    assert "available until 2026-10-15T22:00:00Z" in decisions[1]["data"]["reason"]
