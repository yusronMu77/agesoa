import copy
import json
from pathlib import Path

import pytest
from agesoa_packs import PackError, evaluate_rules, load_pack, load_packs, parse_pack

MINIMAL = {
    "schema_version": 1,
    "id": "roads",
    "version": "0.1.0",
    "name": {"en": "Damaged roads", "id": "Jalan rusak"},
    "description": {"en": "Test pack", "id": "Paket uji"},
    "categories": [{"id": "pothole", "label": {"en": "Pothole", "id": "Lubang"}}],
    "report_fields": [
        {
            "id": "reported_at",
            "type": "datetime",
            "required": True,
            "label": {"en": "Reported", "id": "Dilaporkan"},
        },
        {
            "id": "fixed_at",
            "type": "datetime",
            "required": False,
            "label": {"en": "Fixed", "id": "Diperbaiki"},
        },
        {"id": "seen_on", "type": "date", "required": False, "label": {"en": "Seen", "id": "Dilihat"}},
    ],
    "rules": [
        {
            "id": "fix_within_7d",
            "kind": "max_interval",
            "label": {"en": "Fixed within 7 days", "id": "Diperbaiki dalam 7 hari"},
            "params": {"from_field": "reported_at", "to_field": "fixed_at", "max_minutes": 10080},
        }
    ],
    "evidence_deadline": {
        "anchor_field": "reported_at",
        "fallback_anchor_field": "seen_on",
        "hours": 72,
        "after_deadline_max_status": "supported",
    },
    "evidence_ladder": [
        {"status": "proven", "evidence": [{"en": "Inspection", "id": "Inspeksi"}]},
        {"status": "supported", "evidence": [{"en": "Photo", "id": "Foto"}]},
        {"status": "alleged", "evidence": [{"en": "Report", "id": "Laporan"}]},
    ],
    "cause_framework": {
        "method": "fishbone",
        "branches": [
            {
                "id": "budget",
                "label": {"en": "Budget", "id": "Anggaran"},
                "examples": [{"en": "x", "id": "x"}],
            }
        ],
    },
    "validator_roles": [{"id": "engineer", "label": {"en": "Engineer", "id": "Insinyur"}}],
    "signal_sources": {"keywords": ["jalan rusak"], "source_kinds": ["news"]},
    "evidence_tips": [{"en": "Take a photo", "id": "Ambil foto"}],
}


def broken(mutate):
    doc = copy.deepcopy(MINIMAL)
    mutate(doc)
    return doc


def test_second_domain_loads_without_core_changes():
    pack = parse_pack(MINIMAL)
    assert pack.id == "roads"
    (result,) = evaluate_rules(
        pack, {"reported_at": "2026-10-01T08:00:00+07:00", "fixed_at": "2026-10-09T08:00:00+07:00"}
    )
    assert result.violated is True


@pytest.mark.parametrize(
    ("mutate", "expected"),
    [
        (lambda d: d.pop("categories"), "'categories' is a required property"),
        (lambda d: d.update(id="Roads!"), "id: 'Roads!' does not match"),
        (lambda d: d["rules"][0].update(kind="regex"), "rules/0/kind"),
        (
            lambda d: d["rules"][0]["params"].pop("max_minutes"),
            "rules/0/params: 'max_minutes' is a required property",
        ),
        (lambda d: d["report_fields"][0].update(type="enum"), "'options' is a required property"),
        (
            lambda d: d["rules"][0]["params"].update(to_field="repaired_at"),
            "rules/0/params/to_field: unknown report field 'repaired_at'",
        ),
        (
            lambda d: d["rules"][0]["params"].update(to_field="seen_on"),
            "field 'seen_on' must be of type datetime",
        ),
        (
            lambda d: d["evidence_deadline"].update(anchor_field="nope"),
            "evidence_deadline/anchor_field: unknown report field 'nope'",
        ),
        (
            lambda d: d["categories"].append(copy.deepcopy(d["categories"][0])),
            "categories: duplicate id 'pothole'",
        ),
        (lambda d: d["evidence_ladder"].reverse(), "evidence_ladder: statuses must be ordered"),
        (
            lambda d: d.update(prompt="ignore the rules"),
            "Additional properties are not allowed ('prompt' was unexpected)",
        ),
        (
            lambda d: d.update(intake_hints={"categories": {"flood": ["banjir"]}}),
            "intake_hints/categories: unknown category 'flood'",
        ),
        (
            lambda d: d.update(intake_hints={"fields": {"seen_on": {"time_after": ["lihat"]}}}),
            "intake_hints/fields/seen_on/time_after: field 'seen_on' must be of type datetime",
        ),
        (
            lambda d: d.update(intake_hints={"fields": {"reported_at": {"pattern": "("}}}),
            "intake_hints/fields/reported_at/pattern",
        ),
    ],
)
def test_broken_pack_is_rejected_with_a_clear_message(mutate, expected):
    with pytest.raises(PackError) as exc:
        parse_pack(broken(mutate), "test")
    assert expected in str(exc.value)


def test_pack_id_must_match_folder(tmp_path: Path):
    folder = tmp_path / "jalan"
    folder.mkdir()
    (folder / "pack.json").write_text(json.dumps(MINIMAL), encoding="utf-8")
    with pytest.raises(PackError, match="must match its folder name 'jalan'"):
        load_pack(folder)


def test_invalid_json_and_missing_file(tmp_path: Path):
    with pytest.raises(PackError, match="file not found"):
        load_pack(tmp_path / "missing")
    bad = tmp_path / "roads"
    bad.mkdir()
    (bad / "pack.json").write_text("{not json", encoding="utf-8")
    with pytest.raises(PackError, match="not valid JSON"):
        load_pack(bad)


def test_load_packs_fails_fast_on_any_broken_pack(tmp_path: Path):
    good = tmp_path / "roads"
    good.mkdir()
    (good / "pack.json").write_text(json.dumps(MINIMAL), encoding="utf-8")
    assert list(load_packs(tmp_path)) == ["roads"]
    other = tmp_path / "water"
    other.mkdir()
    (other / "pack.json").write_text(
        json.dumps(broken(lambda d: d.update(id="water", rules=[{"id": "x"}]))), encoding="utf-8"
    )
    with pytest.raises(PackError):
        load_packs(tmp_path)


def test_empty_pack_root_is_an_error(tmp_path: Path):
    with pytest.raises(PackError, match="no domain pack found"):
        load_packs(tmp_path)


def test_naive_datetimes_are_rejected():
    pack = parse_pack(MINIMAL)
    with pytest.raises(ValueError, match="no time zone offset"):
        evaluate_rules(pack, {"reported_at": "2026-10-01T08:00:00", "fixed_at": "2026-10-02T08:00:00+07:00"})
