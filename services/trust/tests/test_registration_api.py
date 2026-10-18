"""Validator registration + staff confirmation API against Postgres (TEST_DATABASE_URL), with the rule-based Role
agent reading the fictional demo documents (no Gemini call in unit tests)."""

import io
from pathlib import Path

import pytest
from agesoa_contracts import validate_event
from agesoa_platform.testing import TEST_DATABASE_URL, RecordingPublisher, isolated_schema
from agesoa_trust.main import build_app
from agesoa_trust.settings import Settings
from fastapi.testclient import TestClient
from PIL import Image

pytestmark = pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL not set")
ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"
DOCS = Path(__file__).resolve().parents[1] / "demo" / "documents"
NEWSROOM_ADMIN = {"Authorization": "Bearer dev:demo-org-admin-1:org_admin"}
OTHER_ADMIN = {"Authorization": "Bearer dev:other-admin:org_admin"}


def person(uid):
    return {"Authorization": f"Bearer dev:{uid}"}


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


def register(client, uid, document, role="journalist", organization_id=None, data_override=None):
    data = data_override if data_override is not None else (DOCS / document).read_bytes()
    form = {"role": role, "field": "Health desk", "regency_name": "Kabupaten Sukamaju (fictional)"}
    if organization_id:
        form["organization_id"] = organization_id
    return client.post(
        "/v1/validators/registrations",
        data=form,
        files={"document": ("doc.png", data, "image/png")},
        headers=person(uid),
    )


def sent(client, event_type):
    return [e for e in client.app.state.test_publisher.sent if e["type"] == f"agesoa.{event_type}"]


def test_role_document_is_read_into_structured_fields_and_waits_for_the_newsroom(client):
    """TC-103 + TC-108 (API part)."""
    r = register(client, "cand-journalist", "press-id-card.png", organization_id="ORG-DEMO-NEWS")
    assert r.status_code == 201, r.text
    body = r.json()
    assert (
        body["status"] == "awaiting_confirmation" and body["path"] == "org_confirmed" and body["tier"] is None
    )
    reading = body["reading"]
    assert reading["document_type"] == "press_id"
    assert {"name", "position", "issuer", "number", "valid_until", "confidence"} <= reading.keys()
    assert isinstance(reading["confidence"], float) and 0 <= reading["confidence"] <= 1
    # before the newsroom confirms: not an active validator, no case
    assert client.get("/v1/validation-requests", headers=person("cand-journalist")).status_code == 403
    # the newsroom sees name + position (no image) and confirms
    pending = client.get("/v1/organizations/ORG-DEMO-NEWS/staff", headers=NEWSROOM_ADMIN).json()
    assert [(p["validator_id"], p["position"]) for p in pending] == [
        (body["validator_id"], "Health reporter")
    ]
    assert set(pending[0]) == {
        "validator_id",
        "role",
        "role_label",
        "name",
        "position",
        "document_type",
        "confidence",
        "requested_at",
    }
    assert client.get("/v1/organizations/ORG-DEMO-NEWS/staff", headers=OTHER_ADMIN).status_code == 404
    done = client.post(
        f"/v1/organizations/ORG-DEMO-NEWS/staff/{body['validator_id']}",
        json={"decision": "confirm"},
        headers=NEWSROOM_ADMIN,
    )
    assert done.json() == {"validator_id": body["validator_id"], "status": "probation", "tier": "high"}
    me = client.get(
        "/v1/validators/me", headers={"Authorization": "Bearer dev:cand-journalist:validator"}
    ).json()
    assert (me["tier"], me["probation"], me["path"]) == ("high", True, "org_confirmed")  # TC-123
    actions = [e["data"]["action"] for e in sent(client, "decision.recorded")]
    assert actions == ["validator.awaiting_confirmation", "validator.confirmed"]
    (activated,) = sent(client, "validator.activated")
    validate_event(activated)
    assert activated["data"]["tier"] == "high" and activated["data"]["status"] == "probation"
    for e in sent(client, "decision.recorded"):
        validate_event(e)
        assert "Dewi" not in str(e)  # the name read from the document never leaves trust


def test_self_declared_with_a_good_document_is_medium_on_probation(client):
    """TC-107 row 2 + TC-123."""
    r = register(client, "cand-nutri", "nutritionist-certificate.png", role="nutritionist")
    assert r.json()["status"] == "probation" and r.json()["tier"] == "medium"
    me = client.get("/v1/validators/me", headers={"Authorization": "Bearer dev:cand-nutri:validator"}).json()
    assert me["probation"] is True and me["status"] == "probation"
    assert sent(client, "validator.activated")[0]["data"]["tier"] == "medium"


@pytest.mark.parametrize(
    ("document", "organization_id", "reason"),
    [
        ("odd-expired-press-id.png", "ORG-DEMO-NEWS", "expired"),  # TC-105
        ("odd-letterhead-mismatch.png", "ORG-DEMO-NEWS", "issuer_mismatch"),  # TC-105
        ("press-id-card.png", "ORG-DEMO-AGENCY", "audited_party"),  # TC-110 step 2
    ],
)
def test_odd_documents_are_rejected_with_a_reason_code(client, document, organization_id, reason):
    r = register(client, f"cand-{reason}", document, organization_id=organization_id)
    assert r.status_code == 201 and r.json()["status"] == "rejected" and r.json()["reason"] == reason
    (decision,) = sent(client, "decision.recorded")
    validate_event(decision)
    assert decision["data"]["action"] == "validator.rejected" and reason in decision["data"]["reason"]
    assert sent(client, "validator.activated") == []


def test_unreadable_documents_and_bad_input(client):
    png = io.BytesIO()
    Image.new("RGB", (64, 64), (200, 200, 200)).save(png, "PNG")
    r = register(client, "cand-blank", None, data_override=png.getvalue())
    assert r.json()["status"] == "rejected" and r.json()["reason"] == "unreadable"
    assert register(client, "cand-pdf", None, data_override=b"%PDF-1.7 not an image").status_code == 415
    assert register(client, "cand-role", "press-id-card.png", role="astronaut").status_code == 422
    empty_role = register(client, "cand-norole", "press-id-card.png", role="")
    assert empty_role.status_code == 422 and empty_role.json()["detail"][0]["loc"] == ["body", "role"]
    assert register(client, "cand-org", "press-id-card.png", organization_id="ORG-NOPE").status_code == 422
    # one registration per person (a rejected one may try again)
    assert (
        register(client, "cand-nutri2", "nutritionist-certificate.png", role="nutritionist").status_code
        == 201
    )
    assert (
        register(client, "cand-nutri2", "nutritionist-certificate.png", role="nutritionist").status_code
        == 409
    )
    assert (
        register(client, "cand-blank", "nutritionist-certificate.png", role="nutritionist").status_code == 201
    )


def test_a_newsroom_admin_cannot_validate_findings(client):
    """TC-109."""
    r = client.post(
        "/v1/validation-requests/F-1/decisions", json={"decision": "approve"}, headers=NEWSROOM_ADMIN
    )
    assert r.status_code == 403


def test_roles_and_verified_newsrooms_for_the_form(client):
    roles = {r["id"] for r in client.get("/v1/validators/roles").json()}
    assert {"journalist", "nutritionist"} <= roles
    newsrooms = client.get("/v1/organizations/newsrooms").json()
    assert [n["organization_id"] for n in newsrooms] == ["ORG-DEMO-NEWS"]  # the agency is not offered
