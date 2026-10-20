import copy
import json

import pytest
from agesoa_contracts import (
    DOMAIN_PACK_SCHEMA,
    EVENTS_DIR,
    SERVICES,
    WEBHOOK_DIR,
    ContractError,
    catalog,
    validate_event,
    validate_webhook_body,
)
from jsonschema import Draft202012Validator

EXAMPLES = EVENTS_DIR / "examples"


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.mark.parametrize(
    "path",
    [*EVENTS_DIR.glob("*.schema.json"), *WEBHOOK_DIR.glob("*.schema.json"), DOMAIN_PACK_SCHEMA],
    ids=lambda p: p.name,
)
def test_every_schema_is_valid_draft_2020_12(path):
    Draft202012Validator.check_schema(load(path))


def test_catalog_entries_point_to_existing_schemas_and_known_services():
    for spec in catalog().values():
        schema = load(EVENTS_DIR / spec.schema_file)
        assert schema["$id"] == spec.dataschema
        assert schema["properties"]["type"]["const"] == spec.ce_type
        assert spec.producer in (*SERVICES, "*")
        assert set(spec.consumers) <= set(SERVICES)
        assert spec.producer not in spec.consumers


def test_every_schema_file_is_in_the_catalog():
    listed = {spec.schema_file for spec in catalog().values()}
    on_disk = {p.name for p in EVENTS_DIR.glob("*.v*.schema.json")}
    assert on_disk == listed


@pytest.mark.parametrize("event_type", sorted(catalog()))
def test_example_event_is_valid(event_type):
    spec = validate_event(load(EXAMPLES / f"{event_type}.json"))
    assert spec.type == event_type


def test_missing_data_field_is_rejected_with_its_path():
    event = load(EXAMPLES / "decision.recorded.json")
    del event["data"]["reason"]
    with pytest.raises(ContractError) as exc:
        validate_event(event)
    assert "'reason' is a required property" in str(exc.value)


def test_unknown_type_is_rejected():
    event = load(EXAMPLES / "decision.recorded.json")
    event["type"] = "agesoa.keputusan.dihapus"
    with pytest.raises(ContractError, match="unknown event type"):
        validate_event(event)


def test_dataschema_must_match_the_type():
    event = load(EXAMPLES / "report.received.json")
    event["dataschema"] = "urn:agesoa:schema:event:signal.received:v1"
    with pytest.raises(ContractError, match="dataschema"):
        validate_event(event)


def test_report_event_accepts_older_payload_without_custom_fields():
    event = load(EXAMPLES / "report.received.json")
    del event["data"]["custom_fields"]
    assert validate_event(event).type == "report.received"


@pytest.mark.parametrize("detail", [None, "Re-inspection scheduled", "x" * 160])
def test_follow_up_detail_is_optional_and_short(detail):
    event = copy.deepcopy(load(EXAMPLES / "follow_up.updated.json"))
    event["data"].pop("detail")
    if detail is not None:
        event["data"]["detail"] = detail
    assert validate_event(event).type == "follow_up.updated"


@pytest.mark.parametrize("detail", ["", "x" * 161, None])
def test_follow_up_detail_is_checked(detail):
    event = copy.deepcopy(load(EXAMPLES / "follow_up.updated.json"))
    event["data"]["detail"] = detail
    with pytest.raises(ContractError):
        validate_event(event)


def test_extra_envelope_attribute_is_rejected():
    event = copy.deepcopy(load(EXAMPLES / "case.updated.json"))
    event["reporter_name"] = "should never travel in an envelope"
    with pytest.raises(ContractError):
        validate_event(event)


def test_findings_and_audit_reports_may_carry_their_text_in_both_languages():
    finding = copy.deepcopy(load(EXAMPLES / "finding.ready_for_validation.json"))
    finding["data"]["statement_i18n"] = {
        "id": "Satu dapur melayani 34 sekolah.",
        "en": "One kitchen serves 34 schools.",
    }
    validate_event(finding)
    report = copy.deepcopy(load(EXAMPLES / "audit_report.created.json"))
    data = report["data"]
    data["summary_i18n"] = {"id": "Ringkasan", "en": "Summary"}
    data["root_causes"][0]["statement_i18n"] = {"id": "Akar masalah"}  # one language is enough
    data["recommendations_i18n"] = [
        {"id": "Rekomendasi", "en": "Recommendation"} for _ in data["recommendations"]
    ]
    validate_event(report)


@pytest.mark.parametrize(
    "i18n",
    [{}, {"fr": "Une cuisine"}, {"id": ""}, "Satu dapur"],
    ids=["empty", "unknown-language", "empty-text", "not-an-object"],
)
def test_localized_text_is_checked(i18n):
    finding = copy.deepcopy(load(EXAMPLES / "finding.ready_for_validation.json"))
    finding["data"]["statement_i18n"] = i18n
    with pytest.raises(ContractError):
        validate_event(finding)


def test_region_never_carries_coordinates():
    event = load(EXAMPLES / "report.received.json")
    event["data"]["region"]["lat"] = -6.92
    with pytest.raises(ContractError, match="region"):
        validate_event(event)


def test_webhook_body_schema():
    body = {
        "event": "test_event",
        "event_id": "0b6f0a3e-7c1e-4d55-9a8e-2f4d2b8f1c11",
        "case": {
            "id": "K-2026-0007",
            "domain": "mbg",
            "category": "poisoning",
            "region": "Kabupaten Sukamaju (fictional)",
            "summary": "Test delivery",
            "root_causes": [],
            "recommendations": [],
            "validations": [],
            "url": "https://example.org/cases/K-2026-0007",
            "synthetic": True,
        },
        "parties_mentioned": [],
    }
    validate_webhook_body(body)
    body["case"]["root_causes"] = [{"statement": "x", "status": "certain", "evidence": []}]
    with pytest.raises(ContractError):
        validate_webhook_body(body)


def test_validation_progress_carries_a_state_never_a_verdict():
    event = copy.deepcopy(load(EXAMPLES / "validation.updated.json"))
    event["data"]["state"] = "awaiting_decisions"
    event["data"]["deadline_at"] = None  # a pack without validation.decision_window_hours
    validate_event(event)
    for verdict in ("approved", "rejected", "proven"):
        event["data"]["state"] = verdict
        with pytest.raises(ContractError, match="state"):
            validate_event(event)


def test_validation_deadline_needs_a_time_zone():
    event = copy.deepcopy(load(EXAMPLES / "validation.updated.json"))
    event["data"]["deadline_at"] = "2026-10-17T03:15:00"  # naive
    with pytest.raises(ContractError, match="deadline_at"):
        validate_event(event)


def test_validation_progress_never_names_validators():
    event = copy.deepcopy(load(EXAMPLES / "validation.updated.json"))
    event["data"]["validator_ref"] = "V-0001"
    with pytest.raises(ContractError):
        validate_event(event)


def test_completed_validation_lists_only_approve_or_reject_decisions():
    """needs_evidence never counts toward quorum, so it is not a decision of validation.completed (v1 unchanged)."""
    event = copy.deepcopy(load(EXAMPLES / "validation.completed.json"))
    event["data"]["decisions"][0]["decision"] = "needs_evidence"
    with pytest.raises(ContractError):
        validate_event(event)


def test_a_validator_vote_asking_for_evidence_fits_decision_recorded_v1():
    event = copy.deepcopy(load(EXAMPLES / "decision.recorded.json"))
    event["data"] |= {
        "actor": {"kind": "human", "name": "Journalist (high tier validator)", "service": "trust"},
        "action": "finding.evidence_requested",
        "reason": "Validator asked for more evidence before deciding. Note: lab result missing.",
    }
    validate_event(event)


@pytest.mark.parametrize(
    ("validation", "valid"),
    [
        ({"decision_window_hours": 72}, True),
        ({}, True),
        ({"decision_window_hours": 0}, False),
        ({"decision_window_hours": 721}, False),
        ({"decision_window_hours": 1.5}, False),
        ({"decision_window_days": 3}, False),
    ],
    ids=["hours", "empty", "zero", "over-30-days", "fraction", "unknown-key"],
)
def test_domain_pack_validation_window(validation, valid):
    schema = load(DOMAIN_PACK_SCHEMA)
    errors = list(Draft202012Validator(schema["properties"]["validation"]).iter_errors(validation))
    assert (not errors) == valid
