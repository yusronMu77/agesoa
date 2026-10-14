"""District boundaries are published as wilayah.diperbarui (real Postgres + PostGIS, TEST_DATABASE_URL)."""

from pathlib import Path

import pytest
from agesoa_contracts import validate_event
from agesoa_ingestion import regions
from agesoa_ingestion.main import build_app
from agesoa_ingestion.settings import Settings
from agesoa_platform.testing import TEST_DATABASE_URL, RecordingPublisher, isolated_schema
from fastapi.testclient import TestClient

pytestmark = pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL not set")
ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"
DISTRICTS = len(regions.load_file(regions.DEMO_REGIONS)["features"])


def boundary_events(app):
    return [e for e in app.state.test_publisher.sent if e["type"] == "agesoa.wilayah.diperbarui"]


def wait_for_startup_publish(client):
    task = getattr(client.app.state, "region_publish", None)
    if task is not None:
        client.portal.call(lambda: task)


@pytest.fixture
async def schema():
    async with isolated_schema(alembic_ini=ALEMBIC_INI) as name:
        yield name


def app_for(schema, tmp_path, demo=True):
    settings = Settings(
        database_url=TEST_DATABASE_URL,
        db_search_path=schema,
        environment="test",
        demo_mode=demo,
        media_dir=tmp_path / "media",
    )
    app = build_app(settings)
    app.state.test_publisher = RecordingPublisher()
    return app


def test_loading_demo_districts_publishes_each_boundary_once(schema, tmp_path, monkeypatch):
    first = app_for(schema, tmp_path)
    monkeypatch.setattr("agesoa_platform.app.PubSubPublisher", lambda *a, **k: first.state.test_publisher)
    with TestClient(first) as client:
        wait_for_startup_publish(client)
        events = boundary_events(first)
    assert len(events) == DISTRICTS
    for e in events:
        validate_event(e)
        assert e["source"] == "//agesoa/ingestion" and e["data"]["synthetic"] is True
        assert e["data"]["geometry"]["type"] in ("Polygon", "MultiPolygon")
        assert set(e["data"]) == {
            "district_code",
            "district_name",
            "regency_code",
            "regency_name",
            "geometry",
            "updated_at",
            "synthetic",
        }

    second = app_for(schema, tmp_path)
    monkeypatch.setattr("agesoa_platform.app.PubSubPublisher", lambda *a, **k: second.state.test_publisher)
    with TestClient(second) as client:
        wait_for_startup_publish(client)
        assert boundary_events(second) == []  # unchanged districts are not published again


def test_publish_endpoint_republishes_every_district(schema, tmp_path, monkeypatch):
    app = app_for(schema, tmp_path)
    monkeypatch.setattr("agesoa_platform.app.PubSubPublisher", lambda *a, **k: app.state.test_publisher)
    with TestClient(app) as client:
        wait_for_startup_publish(client)
        app.state.test_publisher.sent.clear()
        response = client.post("/internal/regions/publish")
        assert response.status_code == 200 and response.json() == {"published": DISTRICTS}
        assert len(boundary_events(app)) == DISTRICTS


def test_no_districts_and_no_events_without_demo_mode(schema, tmp_path, monkeypatch):
    app = app_for(schema, tmp_path, demo=False)
    monkeypatch.setattr("agesoa_platform.app.PubSubPublisher", lambda *a, **k: app.state.test_publisher)
    with TestClient(app) as client:
        assert boundary_events(app) == []
        assert client.post("/internal/regions/publish").json() == {"published": 0}
