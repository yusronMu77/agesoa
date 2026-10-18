"""Hash chain + push path against a real Postgres (TEST_DATABASE_URL); skipped otherwise."""

import json
from pathlib import Path

import pytest
from agesoa_platform.events import new_event
from agesoa_platform.hashing import GENESIS_HASH
from agesoa_platform.testing import TEST_DATABASE_URL, RecordingPublisher, isolated_schema, push_envelope
from agesoa_transparency.main import build_app
from agesoa_transparency.read_model import MemoryStore
from agesoa_transparency.settings import Settings
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

pytestmark = pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL not set")
ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"
EXAMPLE = (
    Path(__file__).resolve().parents[3]
    / "packages"
    / "contracts"
    / "events"
    / "examples"
    / "decision.recorded.json"
)


def decision(source="trust", decision_id="DEC-1"):
    data = json.loads(EXAMPLE.read_text(encoding="utf-8"))["data"]
    data = {**data, "decision_id": decision_id, "actor": {**data["actor"], "service": source}}
    return new_event("decision.recorded", source=source, subject=decision_id, data=data)


@pytest.fixture
async def ctx():
    """TestClient runs the app on its own event loop; direct SQL from the test uses a separate engine."""
    async with isolated_schema(alembic_ini=ALEMBIC_INI) as schema:
        sql = create_async_engine(
            TEST_DATABASE_URL, connect_args={"server_settings": {"search_path": schema}}
        )
        settings = Settings(database_url=TEST_DATABASE_URL, db_search_path=schema, environment="test")
        app = build_app(settings, store=MemoryStore())  # read model is tested in test_read_model.py
        app.state.test_publisher = RecordingPublisher()
        with TestClient(app) as c:
            app.state.outbox.publisher = app.state.test_publisher
            yield c, sql
        await sql.dispose()


@pytest.fixture
def client(ctx):
    return ctx[0]


def push(client, event):
    return client.post("/events/decision.recorded", json=push_envelope(event))


async def test_decisions_from_other_services_are_chained(client):
    assert push(client, decision("trust", "DEC-1")).status_code == 204
    assert push(client, decision("case-audit", "DEC-2")).status_code == 204
    page = client.get("/v1/log").json()
    first, second = page["items"]
    assert (first["seq"], second["seq"]) == (1, 2)
    assert first["prev_hash"] == GENESIS_HASH
    assert second["prev_hash"] == first["hash"]
    assert (first["source_service"], second["source_service"]) == ("trust", "case-audit")
    assert client.get("/v1/log/head").json()["hash"] == second["hash"]
    assert client.get("/v1/log/verify").json() == {
        "ok": True,
        "length": 2,
        "head_hash": second["hash"],
        "first_invalid_seq": None,
        "reason": None,
    }


async def test_redelivered_event_is_logged_once(client):
    event = decision()
    assert push(client, event).status_code == 204
    assert push(client, event).status_code == 204
    assert [e["event_id"] for e in client.get("/v1/log").json()["items"]] == [event["id"]]


async def test_invalid_event_is_rejected_and_not_logged(client):
    event = decision()
    del event["data"]["reason"]
    assert push(client, event).status_code == 400
    assert client.get("/v1/log").json()["items"] == []


async def test_tampering_is_detected(ctx):
    client, sql = ctx
    push(client, decision("trust", "DEC-1"))
    push(client, decision("trust", "DEC-2"))
    async with sql.begin() as conn:
        await conn.execute(text("alter table decision_log disable trigger decision_log_no_change"))
        await conn.execute(
            text(
                """update decision_log set entry = jsonb_set(entry, '{decision,reason}', '"edited"') where seq = 1"""
            )
        )
    result = client.get("/v1/log/verify").json()
    assert result["ok"] is False
    assert result["first_invalid_seq"] == 1


async def test_log_is_append_only_in_the_database(ctx):
    client, sql = ctx
    push(client, decision())
    with pytest.raises(Exception, match="append-only"):
        async with sql.begin() as conn:
            await conn.execute(text("delete from decision_log"))


async def test_probe_goes_through_the_outbox(client):
    body = client.post("/internal/probe").json()
    assert body["published"] == 1
    (sent,) = client.app.state.test_publisher.sent
    assert sent["type"] == "agesoa.decision.recorded"
    assert sent["data"]["action"] == "system.probe"
    assert sent["id"] == body["event_id"]


def test_entry_not_found(client):
    assert client.get("/v1/log/99").status_code == 404
