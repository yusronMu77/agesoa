import json
import uuid

import httpx
import pytest
from fastapi.testclient import TestClient

from sim_institution.main import build_app
from sim_institution.signature import sign
from sim_institution.store import Config, Store

SECRET = "whsec-test"
NOW = 1_760_500_000
BAND = '<span lang="id">SIMULASI – organisasi fiktif</span>'


def report(event: str = "audit_report.final", event_id: str | None = None) -> dict:
    return {
        "event": event,
        "event_id": event_id or str(uuid.uuid4()),
        "case": {
            "id": "CASE-42",
            "domain": "mbg",
            "category": "food_poisoning",
            "region": "Kabupaten Sukamaju",
            "summary": "Repeated food poisoning at a school kitchen.",
            "root_causes": [
                {
                    "statement": "Cold chain broken during delivery.",
                    "status": "supported",
                    "evidence": ["E-1"],
                },
                {"statement": "Kitchen staff untrained.", "status": "alleged", "evidence": []},
            ],
            "recommendations": ["Audit the delivery route."],
            "validations": ["Nutritionist, Kabupaten Sukamaju"],
            "url": "https://agesoa.example/cases/CASE-42",
            "synthetic": True,
        },
        "parties_mentioned": ["Kitchen operator"],
    }


def headers_for(body: bytes, event: str, event_id: str, ts: int = NOW, secret: str = SECRET) -> dict:
    return {
        "Content-Type": "application/json",
        "X-Agesoa-Event": event,
        "X-Agesoa-Event-Id": event_id,
        "X-Agesoa-Timestamp": str(ts),
        "X-Agesoa-Signature": sign(secret, str(ts), body),
    }


def deliver(client: TestClient, payload: dict, *, ts: int = NOW, secret: str = SECRET) -> httpx.Response:
    raw = json.dumps(payload).encode()
    return client.post(
        "/webhook", content=raw, headers=headers_for(raw, payload["event"], payload["event_id"], ts, secret)
    )


def make_client(
    config: Config | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
    store: Store | None = None,
) -> TestClient:
    store = store or Store(config=config or Config(webhook_secret=SECRET))
    return TestClient(build_app(store, clock=lambda: NOW, transport=transport))


def log_entries(client: TestClient) -> list[dict]:
    return client.get("/api/webhook-log").json()["entries"]


def test_healthz():
    assert make_client().get("/healthz").json()["status"] == "ok"


def test_valid_signature_is_accepted_and_goes_to_inbox():
    client = make_client()
    payload = report()
    response = deliver(client, payload)
    assert response.status_code == 200
    assert response.json() == {"internal_ticket": "SIM-1"}
    items = client.get("/api/inbox").json()["items"]
    assert len(items) == 1
    assert items[0]["ticket"] == "SIM-1"
    assert items[0]["event_id"] == payload["event_id"]
    assert items[0]["case"]["id"] == "CASE-42"
    assert items[0]["status"] == "new"
    entry = log_entries(client)[0]
    assert entry["result"] == "accepted"
    assert entry["ticket"] == "SIM-1"
    assert entry["reason"] is None


@pytest.mark.parametrize(
    "mutate",
    [
        lambda h: h.update({"X-Agesoa-Signature": "v1=" + "0" * 64}),
        lambda h: h.pop("X-Agesoa-Signature"),
        lambda h: h.update({"X-Agesoa-Signature": h["X-Agesoa-Signature"].removeprefix("v1=")}),
        lambda h: h.update({"X-Agesoa-Timestamp": str(NOW + 1)}),  # signed over another timestamp
    ],
)
def test_bad_signature_is_rejected(mutate):
    client = make_client()
    payload = report()
    raw = json.dumps(payload).encode()
    headers = headers_for(raw, payload["event"], payload["event_id"])
    mutate(headers)
    response = client.post("/webhook", content=raw, headers=headers)
    assert response.status_code == 401
    assert client.get("/api/inbox").json()["items"] == []
    assert log_entries(client)[0] | {"received_at": None} == {
        "received_at": None,
        "event_id": payload["event_id"],
        "event": "audit_report.final",
        "result": "rejected",
        "reason": "bad_signature",
        "ticket": None,
    }


def test_wrong_secret_is_rejected():
    client = make_client()
    assert deliver(client, report(), secret="other").status_code == 401


def test_tampered_body_is_rejected():
    client = make_client()
    payload = report()
    raw = json.dumps(payload).encode()
    headers = headers_for(raw, payload["event"], payload["event_id"])
    response = client.post("/webhook", content=raw.replace(b"CASE-42", b"CASE-43"), headers=headers)
    assert response.status_code == 401


@pytest.mark.parametrize(
    ("skew", "status"),
    [(299, 200), (300, 200), (301, 401), (-299, 200), (-300, 200), (-301, 401), (-3600, 401)],
)
def test_timestamp_window(skew, status):
    client = make_client()
    # skew > 0: signed in the past; skew < 0: sender clock ahead of the receiver.
    response = deliver(client, report(), ts=NOW - skew)
    assert response.status_code == status
    if status == 401:
        assert log_entries(client)[0]["reason"] == "stale_timestamp"


def test_duplicate_event_id_returns_original_ticket_without_second_item():
    client = make_client()
    payload = report()
    first = deliver(client, payload)
    deliver(client, report())  # another event in between
    retry = deliver(client, payload, ts=NOW + 10)  # retries are re-signed with a new timestamp
    assert first.json() == {"internal_ticket": "SIM-1"}
    assert retry.status_code == 200
    assert retry.json() == {"internal_ticket": "SIM-1"}
    items = client.get("/api/inbox").json()["items"]
    assert [i["ticket"] for i in items] == ["SIM-2", "SIM-1"]
    newest = log_entries(client)[0]
    assert newest["result"] == "duplicate"
    assert newest["ticket"] == "SIM-1"


def test_not_configured_rejects():
    client = make_client(Config())
    response = deliver(client, report())
    assert response.status_code == 401
    assert log_entries(client)[0]["reason"] == "not_configured"


def test_invalid_body_is_rejected():
    client = make_client()
    payload = report()
    del payload["case"]["summary"]
    response = deliver(client, payload)
    assert response.status_code == 400
    assert log_entries(client)[0]["reason"] == "invalid_body"
    assert client.get("/api/inbox").json()["items"] == []


def test_fail_mode_returns_500_then_recovers():
    client = make_client()
    assert client.post("/api/settings", json={"fail_next": 2}).json()["fail_next"] == 2
    payload = report()
    assert deliver(client, payload).status_code == 500
    assert deliver(client, payload).status_code == 500
    assert client.get("/api/settings").json()["fail_next"] == 0
    recovered = deliver(client, payload)
    assert recovered.status_code == 200
    assert recovered.json() == {"internal_ticket": "SIM-1"}
    results = [(e["result"], e["reason"]) for e in log_entries(client)]
    assert results == [("accepted", None), ("rejected", "forced_failure"), ("rejected", "forced_failure")]
    assert len(client.get("/api/inbox").json()["items"]) == 1


def test_settings_never_return_secrets():
    client = make_client(Config())
    assert client.get("/api/settings").json() == {
        "webhook_secret_set": False,
        "api_key_set": False,
        "agesoa_api_url": None,
        "fail_next": 0,
    }
    body = client.post(
        "/api/settings",
        json={"webhook_secret": SECRET, "api_key": "key-1", "agesoa_api_url": "http://agesoa.test/"},
    ).json()
    assert body == {
        "webhook_secret_set": True,
        "api_key_set": True,
        "agesoa_api_url": "http://agesoa.test",
        "fail_next": 0,
    }
    assert SECRET not in client.get("/settings").text
    assert deliver(client, report()).status_code == 200


def test_settings_html_form_keeps_secret_when_left_empty():
    client = make_client()
    response = client.post(
        "/settings",
        data={"webhook_secret": "", "api_key": "k", "agesoa_api_url": "http://a.test", "fail_next": "1"},
    )
    assert response.status_code == 200  # followed the redirect
    assert client.get("/api/settings").json() == {
        "webhook_secret_set": True,
        "api_key_set": True,
        "agesoa_api_url": "http://a.test",
        "fail_next": 1,
    }


def test_test_event_is_marked_in_inbox():
    client = make_client()
    deliver(client, report(event="test_event"))
    page = client.get("/").text
    assert 'data-testid="inbox-item" data-event="test_event"' in page
    assert "Test event" in page


@pytest.mark.parametrize("path", ["/", "/webhook-log", "/settings", "/tickets/SIM-1"])
def test_html_pages_have_band_and_title(path):
    client = make_client()
    deliver(client, report())
    page = client.get(path)
    assert page.status_code == 200
    assert 'data-testid="sim-band"' in page.text
    assert BAND in page.text
    assert "<title>SIM Badan Gizi Kabupaten Sukamaju (fictional)</title>" in page.text


def test_ticket_detail_shows_report():
    client = make_client()
    deliver(client, report())
    page = client.get("/tickets/SIM-1").text
    assert 'data-testid="ticket-number">SIM-1<' in page
    assert "Evidence: supported" in page
    assert "Evidence: alleged" in page
    assert "Audit the delivery route." in page
    assert "Nutritionist, Kabupaten Sukamaju" in page
    assert "Synthetic data: yes" in page
    assert 'data-testid="status-form"' in page
    assert 'data-testid="reply-form"' in page
    assert client.get("/tickets/SIM-99").status_code == 404


def test_webhook_log_page_lists_rows():
    client = make_client()
    deliver(client, report())
    deliver(client, report(), secret="wrong")
    page = client.get("/webhook-log").text
    assert page.count('data-testid="webhook-log-row"') == 2
    assert "bad_signature" in page


def recording_transport(status_code: int, calls: list[httpx.Request]) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(status_code, json={"detail": "nope"} if status_code >= 400 else {"ok": True})

    return httpx.MockTransport(handler)


def configured(transport: httpx.MockTransport) -> TestClient:
    config = Config(webhook_secret=SECRET, api_key="key-123", agesoa_api_url="http://delivery.test")
    client = make_client(config, transport=transport)
    deliver(client, report())
    return client


def test_status_form_calls_agesoa_api():
    calls: list[httpx.Request] = []
    client = configured(recording_transport(200, calls))
    page = client.post("/tickets/SIM-1/status", data={"status": "in_progress", "note": "Team sent"})
    assert len(calls) == 1
    request = calls[0]
    assert str(request.url) == "http://delivery.test/api/v1/cases/CASE-42/status"
    assert request.headers["authorization"] == "Bearer key-123"
    assert json.loads(request.content) == {
        "status": "in_progress",
        "note": "Team sent",
        "internal_ticket": "SIM-1",
    }
    assert 'data-testid="api-result" data-ok="true"' in page.text
    assert "HTTP 200" in page.text
    item = client.get("/api/inbox").json()["items"][0]
    assert (item["status"], item["note"]) == ("in_progress", "Team sent")


def test_reply_form_calls_agesoa_api():
    calls: list[httpx.Request] = []
    client = configured(recording_transport(201, calls))
    page = client.post("/tickets/SIM-1/reply", data={"body": "Our response."})
    assert str(calls[0].url) == "http://delivery.test/api/v1/cases/CASE-42/reply"
    assert calls[0].headers["authorization"] == "Bearer key-123"
    assert json.loads(calls[0].content) == {"body": "Our response.", "attachments": []}
    assert 'data-ok="true"' in page.text
    assert "HTTP 201" in page.text


def test_api_error_is_shown_and_status_kept():
    calls: list[httpx.Request] = []
    client = configured(recording_transport(401, calls))
    page = client.post("/tickets/SIM-1/status", data={"status": "done", "note": ""})
    assert 'data-testid="api-result" data-ok="false"' in page.text
    assert "HTTP 401" in page.text
    assert client.get("/api/inbox").json()["items"][0]["status"] == "new"


def test_api_not_configured_is_shown_without_call():
    calls: list[httpx.Request] = []
    client = make_client(transport=recording_transport(200, calls))
    deliver(client, report())
    page = client.post("/tickets/SIM-1/reply", data={"body": "x"})
    assert calls == []
    assert "not configured" in page.text


def test_persistence_to_data_file(tmp_path):
    path = tmp_path / "sim.json"
    client = make_client(store=Store(config=Config(webhook_secret=SECRET), path=path))
    payload = report()
    deliver(client, payload)
    client.post("/api/settings", json={"fail_next": 3})

    reloaded = make_client(store=Store(config=Config(webhook_secret=SECRET), path=path))
    assert reloaded.get("/api/inbox").json()["items"][0]["ticket"] == "SIM-1"
    assert reloaded.get("/api/settings").json()["fail_next"] == 3
    reloaded.post("/api/settings", json={"fail_next": 0})
    assert deliver(reloaded, payload).json() == {"internal_ticket": "SIM-1"}
    assert deliver(reloaded, report()).json() == {"internal_ticket": "SIM-2"}
    assert oct(path.stat().st_mode & 0o777) == "0o600"
