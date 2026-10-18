"""Case grouping and evidence-deadline rules (pure functions, no database)."""

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from agesoa_case_audit.cases import (
    MATCH_WINDOW,
    OpenCase,
    Source,
    cap_status,
    case_evidence,
    matches,
    new_case_id,
    pick_case,
    regency_key,
    source_from_report,
    source_from_signal,
)
from agesoa_packs import load_pack

PACK = load_pack(Path(__file__).resolve().parents[3] / "domain-packs" / "mbg")
DAY0 = datetime(2026, 10, 14, 0, 0, tzinfo=UTC)
SUKAMAJU = {
    "regency_code": None,
    "regency_name": "Kabupaten Sukamaju",
    "district_code": None,
    "district_name": None,
}


def source(**changes) -> Source:
    base = {
        "kind": "report",
        "id": "R-1",
        "domain": "mbg",
        "category": "poisoning",
        "region": SUKAMAJU,
        "occurred_at": DAY0,
        "deadline_at": DAY0 + timedelta(hours=48),
        "synthetic": True,
    }
    return Source(**{**base, **changes})


def test_general_report_has_no_food_evidence_deadline():
    pack = load_pack(Path(__file__).resolve().parents[3] / "domain-packs" / "general")
    report = {
        "report_id": "qa-general",
        "domain": "general",
        "category": "infrastructure",
        "received_at": DAY0.isoformat(),
        "region": SUKAMAJU,
        "fields": {"occurred_at": "2000-01-01T00:00:00Z"},
        "synthetic": True,
    }
    item = source_from_report(pack, report)
    assert item.domain == "general"
    assert item.deadline_at is None
    evidence = case_evidence(pack, [item.deadline_at], DAY0 + timedelta(days=100))
    assert evidence.status == "unknown"
    assert evidence.deadline_at is None
    assert evidence.max_finding_status == "proven"


def case(**changes) -> OpenCase:
    base = {
        "id": "CASE-1",
        "domain": "mbg",
        "category": "poisoning",
        "region": SUKAMAJU,
        "occurred_at": DAY0,
        "status": "open",
        "synthetic": True,
    }
    return OpenCase(**{**base, **changes})


# --- grouping: decision table ---------------------------------------------------------------------------


def test_a_source_with_the_same_domain_category_regency_and_time_joins_the_case():
    assert matches(case(), source(occurred_at=DAY0 + timedelta(days=2)))


@pytest.mark.parametrize(
    "changes",
    [
        {"category": "spoiled_food"},
        {"domain": "roads"},
        {"region": {**SUKAMAJU, "regency_name": "Kabupaten Lain"}},
        {"region": None},
        {"region": {"regency_code": None, "regency_name": "  "}},
        {"occurred_at": DAY0 + MATCH_WINDOW + timedelta(minutes=1)},
        {"occurred_at": DAY0 - MATCH_WINDOW - timedelta(minutes=1)},
    ],
)
def test_a_source_that_differs_in_one_condition_does_not_join(changes):
    assert not matches(case(), source(**changes))


def test_the_window_edge_is_inclusive_in_both_directions():
    assert matches(case(), source(occurred_at=DAY0 + MATCH_WINDOW))
    assert matches(case(), source(occurred_at=DAY0 - MATCH_WINDOW))


def test_regency_matches_by_code_when_known_otherwise_by_normalised_name():
    coded = {"regency_code": "3201", "regency_name": "Kabupaten Bogor"}
    renamed = {"regency_code": "3201", "regency_name": "Bogor Regency"}
    assert regency_key(coded) == regency_key(renamed)
    assert regency_key({"regency_code": None, "regency_name": " Kabupaten SUKAMAJU "}) == regency_key(
        SUKAMAJU
    )
    assert regency_key(None) is None


def test_a_closed_or_final_case_never_takes_new_sources():
    assert pick_case([case(status="final"), case(id="CASE-2", status="closed")], source()) is None


def test_the_closest_case_in_time_wins_and_the_id_breaks_a_tie():
    near, far = (
        case(id="CASE-B", occurred_at=DAY0 + timedelta(days=1)),
        case(id="CASE-A", occurred_at=DAY0 - timedelta(days=5)),
    )
    assert pick_case([far, near], source(occurred_at=DAY0 + timedelta(days=2))) is near
    tie_a, tie_b = case(id="CASE-A"), case(id="CASE-B")
    assert pick_case([tie_b, tie_a], source()) is tie_a


def test_no_matching_case_opens_a_new_one():
    assert pick_case([case(category="spoiled_food")], source()) is None
    assert pick_case([], source()) is None


def test_a_case_id_is_stable_for_the_source_that_opened_it():
    assert new_case_id(source()) == new_case_id(source())
    assert new_case_id(source()) != new_case_id(source(id="R-2"))
    assert new_case_id(source()) != new_case_id(source(kind="signal"))
    assert len(new_case_id(source())) <= 32


# --- evidence deadline ----------------------------------------------------------------------------------


def test_evidence_is_available_until_the_deadline_and_the_deadline_itself_counts():
    deadline = DAY0 + timedelta(hours=48)
    inside = case_evidence(PACK, [deadline], deadline)
    assert (inside.status, inside.deadline_at, inside.max_finding_status) == ("available", deadline, "proven")
    just_after = case_evidence(PACK, [deadline], deadline + timedelta(seconds=1))
    assert (just_after.status, just_after.max_finding_status) == ("likely_lost", "supported")


def test_the_earliest_deadline_governs_a_case():
    early, late = DAY0 + timedelta(hours=48), DAY0 + timedelta(days=4)
    result = case_evidence(PACK, [late, early, None], early + timedelta(hours=1))
    assert result.deadline_at == early
    assert result.status == "likely_lost"


def test_without_any_known_deadline_the_status_is_unknown_and_nothing_is_capped():
    result = case_evidence(PACK, [None, None], DAY0)
    assert (result.status, result.deadline_at, result.max_finding_status) == ("unknown", None, "proven")
    assert case_evidence(PACK, [], DAY0).status == "unknown"


@pytest.mark.parametrize(
    ("requested", "maximum", "expected"),
    [
        ("proven", "proven", "proven"),
        ("proven", "supported", "supported"),
        ("proven", "alleged", "alleged"),
        ("supported", "proven", "supported"),
        ("supported", "supported", "supported"),
        ("alleged", "supported", "alleged"),
    ],
)
def test_a_finding_never_outranks_the_evidence_cap(requested, maximum, expected):
    assert cap_status(requested, maximum) == expected


# --- sources from events (MBG pack parameters) ----------------------------------------------------------


def report(**fields):
    return {
        "report_id": "R-9",
        "domain": "mbg",
        "category": "poisoning",
        "received_at": "2026-10-14T03:15:00Z",
        "region": SUKAMAJU,
        "fields": fields,
        "rule_results": [],
        "evidence": [],
        "reporter_ref": "anon-1",
        "synthetic": True,
    }


def test_a_report_deadline_is_48_hours_after_the_tray_label_time():
    src = source_from_report(PACK, report(cooked_at="2026-10-13T22:00:00Z"))
    assert src.occurred_at == datetime(2026, 10, 13, 22, 0, tzinfo=UTC)
    assert src.deadline_at == datetime(2026, 10, 15, 22, 0, tzinfo=UTC)  # the value in the contract example


def test_a_report_without_a_tray_label_falls_back_to_midnight_of_the_meal_date_in_jakarta():
    src = source_from_report(PACK, report(meal_date="2026-10-14"))
    assert src.occurred_at == datetime(2026, 10, 13, 17, 0, tzinfo=UTC)  # 00:00 WIB
    assert src.deadline_at == datetime(2026, 10, 15, 17, 0, tzinfo=UTC)


def test_a_report_with_no_incident_time_uses_its_arrival_and_has_no_deadline():
    src = source_from_report(PACK, report())
    assert src.occurred_at == datetime(2026, 10, 14, 3, 15, tzinfo=UTC)
    assert src.deadline_at is None


def test_a_signal_anchors_at_midnight_of_the_incident_day_in_jakarta():
    data = {
        "signal_id": "S-1",
        "domain": "mbg",
        "category": "poisoning",
        "occurred_on": "2026-09-30",
        "region": SUKAMAJU,
        "summary": "x",
        "sources": [],
        "dedup_key": "k",
        "synthetic": True,
    }
    src = source_from_signal(PACK, data)
    assert src.kind == "signal"
    assert src.occurred_at == datetime(2026, 9, 29, 17, 0, tzinfo=UTC)
    assert src.deadline_at == datetime(2026, 10, 1, 17, 0, tzinfo=UTC)


def test_the_snapshot_drops_the_reporter_reference():
    src = source_from_report(PACK, report(cooked_at="2026-10-13T22:00:00Z"))
    snapshot = src.snapshot(report(cooked_at="2026-10-13T22:00:00Z"))
    assert "reporter_ref" not in snapshot["data"]
    assert snapshot["deadline_at"] == "2026-10-15T22:00:00Z"
