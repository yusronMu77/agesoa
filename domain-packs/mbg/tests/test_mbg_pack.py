"""MBG pack rules at their boundaries (TC-010 four-hour rule, TC-011 evidence deadline)."""

from pathlib import Path

import pytest
from agesoa_packs import evaluate_rules, evidence_status, load_pack

PACK = load_pack(Path(__file__).resolve().parents[1])
COOKED = "2026-10-14T05:00:00+07:00"


def four_hour_rule(eaten_at: str):
    (result,) = [
        r
        for r in evaluate_rules(PACK, {"cooked_at": COOKED, "eaten_at": eaten_at})
        if r.rule_id == "consume_within_4h"
    ]
    return result


def test_pack_loads_with_core_fields():
    assert PACK.id == "mbg"
    assert {"school", "cooked_at", "eaten_at", "symptoms"} <= set(PACK.required_field_ids())
    assert "tray_label_text" in PACK.fields
    assert {b["id"] for b in PACK.cause_branches} >= {"ingredients", "process", "distribution", "oversight"}


@pytest.mark.parametrize(
    ("eaten_at", "violated"),
    [
        ("2026-10-14T08:59:00+07:00", False),  # 3:59
        ("2026-10-14T09:00:00+07:00", False),  # 4:00 exactly still passes
        ("2026-10-14T09:01:00+07:00", True),  # 4:01
        ("2026-10-14T09:00:01+07:00", True),  # one second over
    ],
)
def test_four_hour_rule_boundaries(eaten_at, violated):
    assert four_hour_rule(eaten_at).violated is violated


def test_four_hour_rule_across_time_zones():
    # 05:00 WIB = 22:00Z the day before; eaten 02:30Z = 09:30 WIB -> 4:30 -> violated
    assert four_hour_rule("2026-10-14T02:30:00Z").violated is True


def test_four_hour_rule_not_evaluated_without_cooking_time():
    (result,) = evaluate_rules(PACK, {"eaten_at": "2026-10-14T09:00:00+07:00"})
    assert result.violated is None
    assert "cooked_at" in result.detail


@pytest.mark.parametrize(
    ("received_at", "status", "max_status"),
    [
        ("2026-10-16T04:59:00+07:00", "available", "proven"),  # 47:59
        ("2026-10-16T05:00:00+07:00", "available", "proven"),  # 48:00 exactly
        ("2026-10-16T05:01:00+07:00", "likely_lost", "supported"),  # 48:01
    ],
)
def test_evidence_deadline_counts_from_cooking_time(received_at, status, max_status):
    result = evidence_status(PACK, {"cooked_at": COOKED}, received_at)
    assert result.status == status
    assert result.max_finding_status == max_status
    assert result.deadline_at.isoformat() == "2026-10-15T22:00:00+00:00"


def test_evidence_deadline_falls_back_to_meal_date_midnight_wib():
    result = evidence_status(PACK, {"meal_date": "2026-10-14"}, "2026-10-16T00:00:00+07:00")
    assert result.status == "available"
    assert result.deadline_at.isoformat() == "2026-10-15T17:00:00+00:00"
    late = evidence_status(PACK, {"meal_date": "2026-10-14"}, "2026-10-16T00:01:00+07:00")
    assert late.status == "likely_lost"


def test_evidence_deadline_unknown_without_any_anchor():
    result = evidence_status(PACK, {}, "2026-10-16T00:00:00+07:00")
    assert result.status == "unknown"
    assert result.deadline_at is None
