"""Demo reset against a real Postgres (TEST_DATABASE_URL); skipped otherwise."""

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

pytestmark = pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL not set")
ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"
EXAMPLE = (
    Path(__file__).resolve().parents[3]
    / "packages"
    / "contracts"
    / "events"
    / "examples"
    / "keputusan.dicatat.json"
)


def decision(decision_id: str):
    data = json.loads(EXAMPLE.read_text(encoding="utf-8"))["data"]
    data = {**data, "decision_id": decision_id, "actor": {**data["actor"], "service": "trust"}}
    return new_event("keputusan.dicatat", source="trust", subject=decision_id, data=data)


def make_client(schema: str, *, demo_mode: bool) -> TestClient:
    settings = Settings(
        database_url=TEST_DATABASE_URL, db_search_path=schema, environment="test", demo_mode=demo_mode
    )
    app = build_app(settings, store=MemoryStore())
    app.state.test_publisher = RecordingPublisher()
    return TestClient(app)


async def test_reset_restarts_the_log_with_an_entry_that_says_so():
    async with isolated_schema(alembic_ini=ALEMBIC_INI) as schema:
        with make_client(schema, demo_mode=True) as client:
            for n in (1, 2, 3):
                body = push_envelope(decision(f"DEC-{n}"))
                assert client.post("/events/keputusan.dicatat", json=body).status_code == 204
            assert client.get("/v1/log/head").json()["seq"] == 3

            assert client.post("/internal/demo/reset").status_code == 200

            items = client.get("/v1/log").json()["items"]
            assert len(items) == 1
            entry = items[0]
            assert (entry["seq"], entry["prev_hash"], entry["action"]) == (1, GENESIS_HASH, "demo.reset")
            assert entry["entry"]["decision"]["actor"]["kind"] == "system"
            assert client.get("/v1/log/verify").json()["ok"] is True
            assert client.get("/v1/log/head").json()["hash"] == entry["hash"]

            # the chain keeps growing normally afterwards
            assert (
                client.post("/events/keputusan.dicatat", json=push_envelope(decision("DEC-9"))).status_code
                == 204
            )
            assert client.get("/v1/log/verify").json()["ok"] is True
            assert client.get("/v1/log/head").json()["seq"] == 2


async def test_reset_is_404_and_changes_nothing_without_demo_mode():
    async with isolated_schema(alembic_ini=ALEMBIC_INI) as schema:
        with make_client(schema, demo_mode=False) as client:
            body = push_envelope(decision("DEC-1"))
            assert client.post("/events/keputusan.dicatat", json=body).status_code == 204
            assert client.post("/internal/demo/reset").status_code == 404
            assert client.get("/v1/log/head").json()["seq"] == 1
