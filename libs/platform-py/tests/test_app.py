"""App factory and HTTP guards, without a database (the DB is never touched by these routes)."""

import base64
import json
from pathlib import Path

import pytest
from agesoa_platform.app import create_app
from agesoa_platform.auth import Principal, require_role
from agesoa_platform.demo import require_demo_mode
from agesoa_platform.events import new_event
from agesoa_platform.push import check_handlers, decode_push, not_handled_yet
from agesoa_platform.settings import ServiceSettings
from fastapi import APIRouter, Depends, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.exc import DBAPIError

EXAMPLES = Path(__file__).resolve().parents[3] / "packages" / "contracts" / "events" / "examples"


def make_app(**overrides):
    settings = ServiceSettings(
        service_name="transparency", database_url="postgresql+asyncpg://u:p@localhost:1/x", **overrides
    )
    router = APIRouter()

    @router.get("/v1/demo-only", dependencies=[Depends(require_demo_mode)])
    async def demo_only() -> dict:
        return {"ok": True}

    @router.get("/v1/items/{item_id}")
    async def item(item_id: int) -> dict:
        return {"id": item_id}

    @router.get("/v1/ops-only")
    async def ops_only(principal: Principal = Depends(require_role("operator"))) -> dict:  # noqa: B008
        return {"uid": principal.uid}

    return create_app(settings=settings, title="t", description="d", version="0", routers=[router])


def test_healthz_needs_no_database():
    with TestClient(make_app()) as client:
        assert client.get("/healthz").json() == {
            "service": "transparency",
            "status": "ok",
            "release": "dev",
            "environment": "local",
            "demo_mode": False,
        }


def test_unsupported_method_on_an_included_router_is_405():
    """Regression: the tracing middleware crashed (500) on a method mismatch in an included router."""
    with TestClient(make_app()) as client:
        assert client.put("/v1/items/1").status_code == 405
        assert client.request("TRACE", "/v1/items/1").status_code == 405
        assert client.delete("/healthz").status_code == 405


def test_405_allow_lists_every_method_of_the_path():
    """One path with several methods is several routes; `Allow` must list them all, not the first route's."""
    app = make_app()

    @app.get("/v1/things/{thing_id}")
    async def read_thing(thing_id: str) -> dict:
        return {}

    @app.patch("/v1/things/{thing_id}")
    async def change_thing(thing_id: str) -> dict:
        return {}

    with TestClient(app) as client:
        response = client.options("/v1/things/abc")
        assert response.status_code == 405
        assert response.headers["allow"] == "GET, PATCH"
        assert client.delete("/healthz").headers["allow"] == "GET"
        assert client.put("/v1/nothing-here").status_code == 404


def test_422_with_a_plain_message_has_the_shape_of_the_contract():
    """`HTTPValidationError.detail` is a list of {type, loc, msg}; handlers raising 422 with a string get it too."""
    app = make_app()

    @app.get("/v1/picky")
    async def picky() -> dict:
        raise HTTPException(422, "unknown category 'x'")

    with TestClient(app) as client:
        body = client.get("/v1/picky").json()
        assert body == {"detail": [{"type": "value_error", "loc": ["body"], "msg": "unknown category 'x'"}]}
        assert client.get("/v1/items/not-a-number").json()["detail"][0]["loc"] == ["path", "item_id"]


def test_422_does_not_echo_the_input_and_survives_unpaired_surrogates():
    app = make_app()

    @app.post("/v1/echo")
    async def echo(body: dict[str, int]) -> dict:
        return body

    with TestClient(app) as client:
        response = client.post("/v1/echo", content=b'{"secret-\ud81d": "my-password"}')
        assert response.status_code == 422
        assert "my-password" not in response.text
        assert set(response.json()["detail"][0]) == {"type", "loc", "msg"}


def test_text_the_database_rejects_is_a_422():
    """Postgres answers 22021 for NUL; a request carrying it is a client error, any other DB error stays a 500."""
    app = make_app()

    class Rejected(Exception):
        sqlstate = "22021"

    class Broken(Exception):
        sqlstate = "40001"

    @app.get("/v1/nul")
    async def nul() -> dict:
        raise DBAPIError("insert", {}, Rejected("invalid byte sequence"))

    @app.get("/v1/broken")
    async def broken() -> dict:
        raise DBAPIError("insert", {}, Broken("serialization failure"))

    with TestClient(app, raise_server_exceptions=False) as client:
        assert client.get("/v1/nul").status_code == 422
        assert client.get("/v1/broken").status_code == 500


def test_server_spans_are_named_after_the_route_template():
    from opentelemetry import trace
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor
    from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

    exporter = InMemorySpanExporter()
    app = make_app()  # sets up the tracer provider
    trace.get_tracer_provider().add_span_processor(SimpleSpanProcessor(exporter))
    with TestClient(app) as client:
        assert client.get("/v1/items/42").json() == {"id": 42}
        client.get("/healthz")  # excluded
    servers = [s for s in exporter.get_finished_spans() if s.kind == trace.SpanKind.SERVER]
    assert [(s.name, s.attributes.get("http.route")) for s in servers] == [
        ("GET /v1/items/{item_id}", "/v1/items/{item_id}")
    ]


def test_demo_route_is_404_when_flag_off_and_200_when_on():
    with TestClient(make_app()) as client:
        assert client.get("/v1/demo-only").status_code == 404
    with TestClient(make_app(demo_mode=True)) as client:
        assert client.get("/v1/demo-only").json() == {"ok": True}


def test_demo_reset_does_not_exist_unless_demo_mode_is_on():
    """The reset empties the service's database: with the flag off the route is a plain 404."""
    with TestClient(make_app()) as client:
        assert client.post("/internal/demo/reset").status_code == 404


def test_dev_tokens_work_only_locally():
    with TestClient(make_app()) as client:
        assert client.get("/v1/ops-only").status_code == 401
        assert (
            client.get("/v1/ops-only", headers={"Authorization": "Bearer dev:u1:validator"}).status_code
            == 403
        )
        ok = client.get("/v1/ops-only", headers={"Authorization": "Bearer dev:u1:operator"})
        assert ok.json() == {"uid": "u1"}
    with TestClient(make_app(environment="demo", oidc_audience="agesoa-demo-transparency")) as client:
        assert (
            client.get("/v1/ops-only", headers={"Authorization": "Bearer dev:u1:operator"}).status_code == 401
        )


def test_internal_endpoints_require_oidc_outside_local():
    with TestClient(make_app(environment="demo", oidc_audience="agesoa-demo-transparency")) as client:
        assert client.post("/internal/outbox/sweep").status_code == 401
        assert (
            client.post("/internal/probe", headers={"Authorization": "Bearer not-a-jwt"}).status_code == 401
        )


def test_new_event_enforces_contract_and_producer():
    event = new_event(
        "kasus.diperbarui",
        source="case-audit",
        subject="K-1",
        data=json.loads((EXAMPLES / "kasus.diperbarui.json").read_text(encoding="utf-8"))["data"],
    )
    assert event["type"] == "agesoa.kasus.diperbarui"
    with pytest.raises(ValueError, match="not the producer"):
        new_event("kasus.diperbarui", source="trust", subject="K-1", data=event["data"])
    with pytest.raises(ValueError, match="required property"):
        new_event("kasus.diperbarui", source="case-audit", subject="K-1", data={})


def test_handlers_must_match_the_catalog():
    check_handlers("trust", {"temuan.siap_validasi": not_handled_yet})
    with pytest.raises(RuntimeError, match="missing"):
        check_handlers("trust", {})
    with pytest.raises(RuntimeError, match="not routed here"):
        check_handlers(
            "trust", {"temuan.siap_validasi": not_handled_yet, "laporan.diterima": not_handled_yet}
        )


def test_push_envelope_decoding():
    event = {"id": "x"}
    body = {"message": {"data": base64.b64encode(json.dumps(event).encode()).decode()}}
    assert decode_push(body) == event
    with pytest.raises(Exception, match="push envelope"):
        decode_push({"message": {"data": "%%%"}})


def emulator_token(project="agesoa-local", **claims):
    """Unsigned ID token as the Firebase Auth emulator issues it (alg "none")."""
    import base64
    import json
    import time

    def b64(value: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")

    payload = {
        "iss": f"https://securetoken.google.com/{project}",
        "aud": project,
        "sub": "uid-1",
        "exp": int(time.time()) + 3600,
        "firebase": {"sign_in_provider": "password"},
        **claims,
    }
    return f"{b64({'alg': 'none', 'typ': 'JWT'})}.{b64(payload)}."


def test_auth_emulator_tokens_are_accepted_only_with_the_emulator_locally(monkeypatch):
    emu = {"firebase_auth_emulator_host": "localhost:9099", "google_cloud_project": "agesoa-local"}
    good = {"Authorization": "Bearer " + emulator_token(operator=True)}
    with TestClient(make_app(**emu)) as client:
        assert client.get("/v1/ops-only", headers=good).json() == {"uid": "uid-1"}
        no_role = {"Authorization": "Bearer " + emulator_token()}
        assert client.get("/v1/ops-only", headers=no_role).status_code == 403
        other = {"Authorization": "Bearer " + emulator_token(project="someone-else", operator=True)}
        assert client.get("/v1/ops-only", headers=other).status_code == 401
        expired = {"Authorization": "Bearer " + emulator_token(operator=True, exp=1)}
        assert client.get("/v1/ops-only", headers=expired).status_code == 401
    # Without the emulator setting the real signature check runs (stubbed: no network in tests) and rejects it.
    calls = []

    def real_check(token, request, audience):
        calls.append(audience)
        raise ValueError("signature")

    monkeypatch.setattr("agesoa_platform.auth.id_token.verify_firebase_token", real_check)
    with TestClient(make_app(google_cloud_project="agesoa-local")) as client:
        assert client.get("/v1/ops-only", headers=good).status_code == 401
    assert calls == ["agesoa-local"]


def test_auth_emulator_is_refused_outside_local():
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError, match="FIREBASE_AUTH_EMULATOR_HOST"):
        ServiceSettings(
            service_name="x",
            database_url="postgresql+asyncpg://u:p@localhost:1/x",
            environment="demo",
            oidc_audience="a",
            firebase_auth_emulator_host="localhost:9099",
        )
