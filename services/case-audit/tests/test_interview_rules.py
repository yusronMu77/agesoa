"""Which question is asked next, and which pattern tests an agent may ask for (no database needed)."""

import pytest
from agesoa_case_audit.interview import MAX_QUESTIONS, TARGET_OPEN, plan_questions, question_id
from agesoa_case_audit.patterns import MAX_WINDOW_DAYS, PatternError, validate
from agesoa_case_audit.settings import REPO_DOMAIN_PACKS
from agesoa_packs import load_pack

PACK = load_pack(REPO_DOMAIN_PACKS / "mbg")
ORDER = [b["id"] for b in PACK.cause_branches]


def test_the_first_round_asks_two_questions_from_the_best_ranked_branches():
    planned = plan_questions(PACK, "C-1", ["process", "ingredients", *ORDER], asked_keys=set(), open_count=0)

    assert len(planned) == TARGET_OPEN == 2
    assert [q.branch for q in planned] == ["process", "process"]  # the best branch with questions goes first
    assert all(q.text["en"] and q.text["id"] for q in planned)


def test_branches_without_questions_are_skipped_and_the_next_branch_is_used():
    planned = plan_questions(
        PACK, "C-1", ["people", "facility", "ingredients", "process"], asked_keys=set(), open_count=0
    )

    assert [q.branch for q in planned] == ["ingredients", "process"]


def test_a_question_is_never_asked_twice_and_the_same_case_gets_the_same_ids():
    first = plan_questions(PACK, "C-1", ORDER, asked_keys=set(), open_count=0)
    again = plan_questions(PACK, "C-1", ORDER, asked_keys=set(), open_count=0)
    later = plan_questions(PACK, "C-1", ORDER, asked_keys={q.key for q in first}, open_count=0)

    assert first == again
    assert not {q.key for q in later} & {q.key for q in first}
    assert question_id("C-1", "process:0") != question_id("C-2", "process:0")


def test_open_questions_count_against_the_target_and_the_total_is_capped():
    assert plan_questions(PACK, "C-1", ORDER, asked_keys={"process:0", "process:1"}, open_count=2) == []
    one = plan_questions(PACK, "C-1", ORDER, asked_keys={"process:0"}, open_count=1)
    assert len(one) == 1
    every_key = {
        f"{b['id']}:{i}" for b in PACK.cause_branches for i, _ in enumerate(b.get("witness_questions", []))
    }
    assert MAX_QUESTIONS >= 2
    asked = set(list(every_key)[:MAX_QUESTIONS])
    assert plan_questions(PACK, "C-1", ORDER, asked_keys=asked, open_count=0) == []


def test_the_asked_text_comes_from_the_pack_only():
    planned = plan_questions(PACK, "C-1", ORDER, asked_keys=set(), open_count=0)
    pack_texts = [t for b in PACK.cause_branches for t in b.get("witness_questions", [])]
    assert all(q.text in pack_texts for q in planned)


def test_a_pattern_test_may_only_ask_for_a_metric_of_the_branch_within_the_window():
    assert validate(PACK, "process", "rule_violations_per_kitchen", 30)["kind"] == "violations_by"
    with pytest.raises(PatternError, match="no pattern metric"):
        validate(PACK, "ingredients", "rule_violations_per_kitchen", 30)  # a metric of another branch
    with pytest.raises(PatternError, match="no pattern metric"):
        validate(PACK, "process", "'; drop table cases; --", 30)
    with pytest.raises(PatternError, match="unknown cause branch"):
        validate(PACK, "nope", "x", 30)
    for days in (0, -5, MAX_WINDOW_DAYS + 1):
        with pytest.raises(PatternError, match="window_days"):
            validate(PACK, "process", "cook_to_meal_minutes", days)
