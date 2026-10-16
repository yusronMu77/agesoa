"""Public read model: projection rules (pure), the push -> Postgres -> store path (TEST_DATABASE_URL) and the
Firestore client against the emulator (FIRESTORE_EMULATOR_HOST)."""

import json
import os
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest
from agesoa_platform.events import new_event
from agesoa_platform.testing import TEST_DATABASE_URL, RecordingPublisher, isolated_schema, push_envelope
from agesoa_transparency.main import build_app
from agesoa_transparency.read_model import (
    FirestoreStore,
    MemoryStore,
    Row,
    build_case,
    build_finding,
    build_log_entry,
    build_region,
)
from agesoa_transparency.settings import Settings
from fastapi.testclient import TestClient

ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"
EXAMPLES = Path(__file__).resolve().parents[3] / "packages" / "contracts" / "events" / "examples"
PRODUCERS = {
    "kasus.diperbarui": "case-audit",
    "temuan.siap_validasi": "case-audit",
    "validasi.selesai": "trust",
    "laporan_audit.dibuat": "delivery",
    "tindak_lanjut.diperbarui": "delivery",
    "hak_jawab.diterima": "delivery",
    "sinyal.diterima": "ingestion",
    "laporan.diterima": "ingestion",
    "wilayah.diperbarui": "ingestion",
    "keputusan.dicatat": "trust",
}
# A fictional person's name placed only in fields that must never reach the public side.
PERSON = "Siti Rahmawati (fictional)"


def example(event_type: str, **changes):
    data = json.loads((EXAMPLES / f"{event_type}.json").read_text(encoding="utf-8"))["data"]
    data.update(changes)
    subject = data.get("case_id") or data.get("report_id") or data.get("signal_id") or data.get("decision_id")
    return new_event(event_type, source=PRODUCERS[event_type], subject=subject, data=data)


def row(event_type: str, data: dict, minutes: int = 0, id_: int = 1) -> Row:
    return Row(id_, event_type, data, datetime(2026, 10, 14, tzinfo=UTC) + timedelta(minutes=minutes))


def example_data(event_type: str, **changes) -> dict:
    data = json.loads((EXAMPLES / f"{event_type}.json").read_text(encoding="utf-8"))["data"]
    return {**data, **changes}


# --- Pure projection rules ------------------------------------------------------------------------------


def test_case_uses_the_latest_update_whatever_the_delivery_order():
    newer = row("kasus.diperbarui", example_data("kasus.diperbarui", status="final"), minutes=10, id_=1)
    older = row(
        "kasus.diperbarui", example_data("kasus.diperbarui", status="investigating"), minutes=0, id_=2
    )
    assert build_case("K-2026-0007", [newer, older])["status"] == "final"
    assert build_case("K-2026-0007", [older, newer])["status"] == "final"


def test_case_keeps_the_latest_follow_up_per_organization_and_every_reply():
    fu = "tindak_lanjut.diperbarui"
    rows = [
        row(fu, example_data(fu, status="received", organization_id="O-1"), 0, 1),
        row(fu, example_data(fu, status="done", organization_id="O-1"), 5, 2),
        row(fu, example_data(fu, status="in_progress", organization_id="O-2"), 1, 3),
        row("hak_jawab.diterima", example_data("hak_jawab.diterima", reply_id="H-1"), 2, 4),
        row("hak_jawab.diterima", example_data("hak_jawab.diterima", reply_id="H-2"), 3, 5),
    ]
    doc = build_case("K-2026-0007", rows)
    assert [(f["organization_id"], f["status"]) for f in doc["follow_ups"]] == [
        ("O-1", "done"),
        ("O-2", "in_progress"),
    ]
    assert [r["reply_id"] for r in doc["replies"]] == ["H-1", "H-2"]
    assert doc["status"] is None  # no kasus.diperbarui yet: case fields stay empty, not invented


def test_finding_shows_validators_only_as_role_label_regency_tier_and_decision():
    ready = row(
        "temuan.siap_validasi", example_data("temuan.siap_validasi", parties_mentioned=[PERSON]), 0, 1
    )
    decisions = [
        {
            "validator_ref": "V-0001",
            "organization_ref": "O-0001",
            "tier": "high",
            "decision": "approve",
            "note": PERSON,
            "role": "journalist",
            "role_label": "Journalist",
            "regency_name": "Kabupaten Sukamaju (fictional)",
        },
    ]
    done = row("validasi.selesai", example_data("validasi.selesai", decisions=decisions), 5, 2)
    doc = build_finding("F-2026-0011", [ready, done])
    assert doc["validation"]["decisions"] == [
        {
            "tier": "high",
            "decision": "approve",
            "role_label": "Journalist",
            "regency_name": "Kabupaten Sukamaju (fictional)",
        }
    ]
    assert doc["evidence_count"] == 2
    text = json.dumps(doc)
    for private in (PERSON, "V-0001", "O-0001", "parties_mentioned", "required_roles"):
        assert private not in text


def test_log_entry_projection_keeps_the_hash_link():
    entry = SimpleNamespace(
        seq=3,
        event_id="e-3",
        decision_id="DEC-3",
        entry={"decision": example_data("keputusan.dicatat")},
        prev_hash="a" * 64,
        hash="b" * 64,
        recorded_at=datetime(2026, 10, 14, tzinfo=UTC),
    )
    doc = build_log_entry(entry)
    assert (doc["seq"], doc["prev_hash"], doc["hash"]) == (3, "a" * 64, "b" * 64)
    assert doc["actor"]["service"] == example_data("keputusan.dicatat")["actor"]["service"]


# --- Push -> Postgres -> store (real Postgres) --------------------------------------------------------

db = pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL not set")


@pytest.fixture
async def app_store():
    async with isolated_schema(alembic_ini=ALEMBIC_INI) as schema:
        store = MemoryStore()
        settings = Settings(database_url=TEST_DATABASE_URL, db_search_path=schema, environment="test")
        app = build_app(settings, store=store)
        with TestClient(app) as client:
            app.state.outbox.publisher = RecordingPublisher()
            yield client, store


def push(client, event):
    return client.post(f"/events/{event['type'].removeprefix('agesoa.')}", json=push_envelope(event))


def sync(client):
    response = client.post("/internal/read-model/sync")
    assert response.status_code == 200
    return response.json()


def feed(client):
    events = [
        example("laporan.diterima", fields={"reporter_note": f"saya {PERSON}"}),
        example("sinyal.diterima"),
        example("kasus.diperbarui"),
        example("temuan.siap_validasi", parties_mentioned=[PERSON]),
        example("validasi.selesai"),
        example("laporan_audit.dibuat"),
        example("tindak_lanjut.diperbarui"),
        example("hak_jawab.diterima"),
        example("keputusan.dicatat"),
    ]
    for event in events:
        assert push(client, event).status_code == 204
    return events


@db
def test_events_are_projected_to_public_documents(app_store):
    client, store = app_store
    feed(client)
    sync(client)
    docs = store.docs
    assert set(docs) == {"public_cases", "public_findings", "public_signals", "public_log", "public_stats"}
    case = docs["public_cases"]["K-2026-0007"]
    assert case["status"] == "investigating"
    assert case["audit_report"] is not None and case["follow_ups"] and case["replies"]
    finding = next(iter(docs["public_findings"].values()))
    assert finding["validation"]["outcome"] == "approved"
    assert docs["public_log"]["1"]["seq"] == 1
    stats = docs["public_stats"]["summary"]
    assert stats["reports_received"] == 1 and stats["signals_received"] == 1 and stats["log_length"] == 1


@db
def test_no_private_data_reaches_the_read_model(app_store):
    client, store = app_store
    feed(client)
    sync(client)
    text = json.dumps(store.docs)
    for private in (
        PERSON,
        "reporter_ref",
        "validator_ref",
        "organization_ref",
        "internal_ticket",
        "attachments",
    ):
        assert private not in text, private
    assert "public_reports" not in store.docs  # report contents are never projected, only counted


@db
def test_redelivery_does_not_duplicate_and_rebuild_reproduces_the_same_documents(app_store):
    client, store = app_store
    events = feed(client)
    assert push(client, events[2]).status_code == 204  # redelivered kasus.diperbarui
    sync(client)
    before = {c: dict(d) for c, d in store.docs.items() if c != "public_stats"}
    result = client.post("/internal/read-model/rebuild").json()
    # case + finding + signal + 1 log entry + stats (9 events, 5 documents)
    assert result["cleared"] == 5
    after = {c: dict(d) for c, d in store.docs.items() if c != "public_stats"}
    assert after == before
    assert store.docs["public_stats"]["summary"]["log_length"] == 1


@db
def test_projection_runs_after_commit_without_explicit_sync(app_store):
    client, store = app_store
    push(client, example("kasus.diperbarui", case_id="K-AFTER-COMMIT"))
    client.portal.call(client.app.state.read_model.wait_idle)
    assert "K-AFTER-COMMIT" in store.docs.get("public_cases", {})


# --- Firestore client against the emulator ------------------------------------------------------------


@pytest.mark.skipif(not os.environ.get("FIRESTORE_EMULATOR_HOST"), reason="FIRESTORE_EMULATOR_HOST not set")
async def test_firestore_store_round_trip():
    from google.cloud import firestore

    project = f"pytest-{uuid.uuid4().hex[:8]}"
    store = FirestoreStore(project)
    await store.set("public_cases", "K-1", {"case_id": "K-1", "status": "open"})
    snapshot = await firestore.AsyncClient(project=project).collection("public_cases").document("K-1").get()
    assert snapshot.to_dict() == {"case_id": "K-1", "status": "open"}
    assert await store.clear("public_cases") == 1


def test_region_boundary_is_projected_with_geometry_as_json_text():
    data = example_data("wilayah.diperbarui")
    doc = build_region(data["district_code"], [row("wilayah.diperbarui", data)])
    assert doc["district_name"] == data["district_name"]
    assert json.loads(doc["geometry"]) == data["geometry"]  # Firestore has no nested arrays


@db
def test_region_event_reaches_public_regions(app_store):
    client, store = app_store
    event = new_event(
        "wilayah.diperbarui", source="ingestion", subject="99.01.01", data=example_data("wilayah.diperbarui")
    )
    assert push(client, event).status_code == 204
    sync(client)
    region = store.docs["public_regions"]["99.01.01"]
    assert region["regency_name"].endswith("(fictional)") and region["synthetic"] is True
