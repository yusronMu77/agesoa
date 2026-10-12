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
    event = load(EXAMPLES / "keputusan.dicatat.json")
    del event["data"]["reason"]
    with pytest.raises(ContractError) as exc:
        validate_event(event)
    assert "'reason' is a required property" in str(exc.value)


def test_unknown_type_is_rejected():
    event = load(EXAMPLES / "keputusan.dicatat.json")
    event["type"] = "agesoa.keputusan.dihapus"
    with pytest.raises(ContractError, match="unknown event type"):
        validate_event(event)


def test_dataschema_must_match_the_type():
    event = load(EXAMPLES / "laporan.diterima.json")
    event["dataschema"] = "urn:agesoa:schema:event:sinyal.diterima:v1"
    with pytest.raises(ContractError, match="dataschema"):
        validate_event(event)


def test_extra_envelope_attribute_is_rejected():
    event = copy.deepcopy(load(EXAMPLES / "kasus.diperbarui.json"))
    event["reporter_name"] = "should never travel in an envelope"
    with pytest.raises(ContractError):
        validate_event(event)


def test_region_never_carries_coordinates():
    event = load(EXAMPLES / "laporan.diterima.json")
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
