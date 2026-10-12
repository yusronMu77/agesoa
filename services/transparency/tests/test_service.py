import json

from agesoa_transparency.export_openapi import OPENAPI_FILE, offline_app
from fastapi.testclient import TestClient


def test_healthz():
    with TestClient(offline_app()) as client:
        body = client.get("/healthz").json()
    assert body["service"] == "transparency"
    assert body["status"] == "ok"


def test_openapi_file_matches_code():
    """openapi.json is the published contract: regenerate it (export_openapi) whenever the API changes."""
    exported = json.loads(OPENAPI_FILE.read_text(encoding="utf-8"))
    assert exported == offline_app().openapi()


def test_sequence_numbers_beyond_bigint_are_rejected_before_the_database():
    too_big = 2**63
    with TestClient(offline_app()) as client:
        assert client.get(f"/v1/log?after={too_big}").status_code == 422
        assert client.get(f"/v1/log/{too_big}").status_code == 422
        assert client.get("/v1/log/0").status_code == 422
