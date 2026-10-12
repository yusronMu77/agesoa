from agesoa_ingestion.export_openapi import offline_app
from fastapi.testclient import TestClient


def client():
    return TestClient(offline_app())


def test_lists_the_mbg_pack():
    with client() as c:
        packs = c.get("/v1/domain-packs").json()
    assert [p["id"] for p in packs] == ["mbg"]
    assert "consume_within_4h" in packs[0]["rules"]


def test_unknown_pack_is_404():
    with client() as c:
        assert c.get("/v1/domain-packs/roads").status_code == 404


def test_evaluate_four_hour_rule_and_evidence_deadline():
    body = {
        "fields": {"cooked_at": "2026-10-14T05:00:00+07:00", "eaten_at": "2026-10-14T09:01:00+07:00"},
        "received_at": "2026-10-14T10:00:00+07:00",
    }
    with client() as c:
        result = c.post("/v1/domain-packs/mbg/evaluate", json=body).json()
    assert result["rule_results"][0]["rule_id"] == "consume_within_4h"
    assert result["rule_results"][0]["violated"] is True
    assert result["evidence"]["status"] == "available"
    assert result["evidence_tips"]
    assert set(result["missing_required"]) == {"school", "symptoms"}


def test_evaluate_rejects_naive_datetimes():
    body = {
        "fields": {"cooked_at": "2026-10-14T05:00:00", "eaten_at": "2026-10-14T09:01:00+07:00"},
        "received_at": "2026-10-14T10:00:00+07:00",
    }
    with client() as c:
        assert c.post("/v1/domain-packs/mbg/evaluate", json=body).status_code == 422


def test_report_endpoints_require_a_user_and_are_planned():
    with client() as c:
        assert c.post("/v1/reports", json={}).status_code == 401
        planned = c.post("/v1/reports", json={}, headers={"Authorization": "Bearer dev:anon-1:"})
    assert planned.status_code == 501


def demo_client(demo_mode: bool):
    from agesoa_ingestion.main import build_app
    from agesoa_ingestion.settings import Settings

    return TestClient(
        build_app(Settings(database_url="postgresql+asyncpg://t@localhost/t", demo_mode=demo_mode))
    )


def test_scenarios_do_not_exist_without_demo_mode():
    with demo_client(False) as c:
        assert c.get("/v1/demo/scenarios").status_code == 404
        assert c.get("/v1/demo/scenarios/mbg-s01-long-route").status_code == 404


def test_scenarios_are_served_in_demo_mode_without_answer_key():
    with demo_client(True) as c:
        listed = c.get("/v1/demo/scenarios").json()
        one = c.get("/v1/demo/scenarios/mbg-s01-long-route").json()
        missing = c.get("/v1/demo/scenarios/nope")
    assert 5 <= len(listed) <= 8
    assert all(s["synthetic"] and s["region"]["regency_code"] is None for s in listed)
    assert one["id"] == "mbg-s01-long-route"
    assert "answer_key" not in one
    assert missing.status_code == 404
