import json

from agesoa_ingestion.export_openapi import OPENAPI_FILE, offline_app
from fastapi.testclient import TestClient


def test_healthz():
    with TestClient(offline_app()) as client:
        body = client.get("/healthz").json()
    assert body["service"] == "ingestion"
    assert body["status"] == "ok"


def test_openapi_file_matches_code():
    """openapi.json is the published contract: regenerate it (export_openapi) whenever the API changes."""
    exported = json.loads(OPENAPI_FILE.read_text(encoding="utf-8"))
    assert exported == offline_app().openapi()
