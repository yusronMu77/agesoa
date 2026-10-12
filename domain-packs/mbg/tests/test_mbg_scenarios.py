"""MBG synthetic scenarios: 5-8 fictional cases, each with a distinct planted root cause and an answer key."""

import copy
from pathlib import Path

import pytest
from agesoa_packs import PackError, load_pack, load_scenarios, parse_scenario

PACK = load_pack(Path(__file__).resolve().parents[1])
SCENARIOS = load_scenarios(PACK)


def test_five_to_eight_scenarios():
    assert 5 <= len(SCENARIOS) <= 8


def test_root_causes_are_spread_over_the_cause_framework():
    roots = [s.answer_key["root_cause"]["branch"] for s in SCENARIOS.values()]
    assert len(set(roots)) == len(roots), "each scenario plants a different root cause"
    assert len(set(roots)) >= 5


def test_rule_violated_and_rule_met_cases_both_exist():
    """The 4-hour rule must not be a shortcut to the answer: most roots sit elsewhere."""
    violating = [s.id for s in SCENARIOS.values() if s.answer_key["expected_rule_violations"]]
    assert 1 <= len(violating) < len(SCENARIOS)


@pytest.mark.parametrize("scenario_id", sorted(SCENARIOS))
def test_scenario_is_fictional_and_labelled(scenario_id):
    doc = SCENARIOS[scenario_id].document
    assert doc["synthetic"] is True
    assert doc["region"]["regency_code"] is None and doc["region"]["district_code"] is None
    for report in doc["reports"]:
        for key in ("school", "kitchen"):
            if key in report["fields"]:
                assert report["fields"][key].endswith("(fictional)")
    assert doc["answer_key"]["distractors"], "every scenario plants at least one misleading explanation"


@pytest.mark.parametrize("scenario_id", sorted(SCENARIOS))
def test_public_view_hides_the_answer_key(scenario_id):
    view = SCENARIOS[scenario_id].public_view()
    assert "answer_key" not in view
    assert view["id"] == scenario_id


def _scenario():
    return copy.deepcopy(SCENARIOS["mbg-s01-long-route"].document)


def test_expected_violations_must_match_the_engine():
    doc = _scenario()
    doc["answer_key"]["expected_rule_violations"] = []
    with pytest.raises(PackError, match="the reports violate"):
        parse_scenario(doc, PACK)


def test_unknown_cause_branch_is_rejected():
    doc = _scenario()
    doc["answer_key"]["root_cause"]["branch"] = "weather"
    with pytest.raises(PackError, match="unknown cause branch 'weather'"):
        parse_scenario(doc, PACK)


def test_real_region_codes_are_rejected():
    doc = _scenario()
    doc["region"]["regency_code"] = "3201"
    with pytest.raises(PackError, match="region/regency_code"):
        parse_scenario(doc, PACK)


def test_unknown_field_and_category_are_rejected():
    doc = _scenario()
    doc["reports"][0]["fields"]["temperature"] = 30
    doc["reports"][1]["category"] = "flood"
    with pytest.raises(PackError) as exc:
        parse_scenario(doc, PACK)
    assert "unknown report field 'temperature'" in str(exc.value)
    assert "unknown category 'flood'" in str(exc.value)
