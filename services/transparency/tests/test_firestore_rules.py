"""infra/firestore/firestore.rules against a Firestore emulator started with `--rules` (unauthenticated
requests are checked against the rules; `Bearer owner` is the emulator's admin bypass used to seed data).
Set FIRESTORE_RULES_EMULATOR_HOST to run (the agesoa-devenv Firestore emulator starts with these rules)."""

import os
import uuid

import httpx
import pytest

HOST = os.environ.get("FIRESTORE_RULES_EMULATOR_HOST")
pytestmark = pytest.mark.skipif(not HOST, reason="FIRESTORE_RULES_EMULATOR_HOST not set")
PUBLIC = ["public_cases", "public_findings", "public_signals", "public_regions", "public_log", "public_stats"]


@pytest.fixture
def base():
    project = f"rules-{uuid.uuid4().hex[:8]}"
    return f"http://{HOST}/v1/projects/{project}/databases/(default)/documents"


def doc(value: str) -> dict:
    return {"fields": {"value": {"stringValue": value}}}


def seed(base: str, collection: str, doc_id: str) -> None:
    r = httpx.patch(f"{base}/{collection}/{doc_id}", json=doc("x"), headers={"Authorization": "Bearer owner"})
    assert r.status_code == 200, r.text


@pytest.mark.parametrize("collection", PUBLIC)
def test_clients_can_read_public_collections(base, collection):
    seed(base, collection, "d1")
    assert httpx.get(f"{base}/{collection}/d1").status_code == 200


@pytest.mark.parametrize("collection", PUBLIC)
def test_clients_cannot_write_public_collections(base, collection):
    assert httpx.patch(f"{base}/{collection}/d2", json=doc("tampered")).status_code == 403
    seed(base, collection, "d3")
    assert httpx.delete(f"{base}/{collection}/d3").status_code == 403


def test_clients_cannot_read_or_write_anything_else(base):
    seed(base, "reporter_private", "r1")
    assert httpx.get(f"{base}/reporter_private/r1").status_code == 403
    assert httpx.patch(f"{base}/anything/x", json=doc("x")).status_code == 403
