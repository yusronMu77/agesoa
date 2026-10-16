"""Tests for the synthetic scenario evaluation harness."""

from __future__ import annotations

import json
from pathlib import Path

from agesoa_packs import Scenario, load_packs, load_scenarios

from eval.evaluator import evaluate_hypotheses
from eval.runner import run_eval


def test_eval_harness_scores_every_scenario(tmp_path: Path):
    """The harness measures the keyword baseline; reaching TC-017 (planted cause in the top 3 on 5-8
    scenarios) is the job of the Audit agent, so this test checks the numbers, not that the baseline passes."""
    out_file = tmp_path / "results.json"
    report = run_eval(packs_dir="domain-packs", output_file=out_file)

    metrics = report["metrics"]
    assert metrics["total_scenarios"] >= 5
    assert 0 <= metrics["top_1_count"] <= metrics["top_3_count"] <= metrics["total_scenarios"]
    assert metrics["deterministic"] is True
    assert 0.0 <= metrics["mrr"] <= 1.0


def test_answer_key_is_not_an_input_of_the_ranking():
    """Regression: the answer key is the ground truth the ranking is compared with, never evidence for it."""
    packs = load_packs("domain-packs")
    pack = next(iter(packs.values()))
    for scenario in load_scenarios(pack).values():
        stripped = {k: v for k, v in scenario.document.items() if k != "answer_key"}
        without_key = Scenario(id=scenario.id, pack=scenario.pack, document=stripped)
        assert evaluate_hypotheses(scenario, pack) == evaluate_hypotheses(without_key, pack)


def test_eval_harness_writes_valid_json_report(tmp_path: Path):
    out_file = tmp_path / "results.json"
    run_eval(packs_dir="domain-packs", output_file=out_file)

    assert out_file.is_file()
    data = json.loads(out_file.read_text(encoding="utf-8"))
    assert data["schema_version"] == 1
    assert "metrics" in data
    assert "scenarios" in data
    assert len(data["scenarios"]) == data["metrics"]["total_scenarios"]


def test_eval_harness_is_deterministic(tmp_path: Path):
    out1 = tmp_path / "run1.json"
    out2 = tmp_path / "run2.json"

    report1 = run_eval(packs_dir="domain-packs", output_file=out1)
    report2 = run_eval(packs_dir="domain-packs", output_file=out2)

    assert report1 == report2
    assert out1.read_text(encoding="utf-8") == out2.read_text(encoding="utf-8")


def test_the_rules_model_run_goes_through_the_agent_and_cannot_beat_the_baseline(tmp_path: Path):
    """`rules` writes the lexical ranking as a model response: the whole agent path runs without a model call, and
    since it adds nothing to the keyword ranking it must not pass TC-017 (which needs a real improvement)."""
    from eval.runner import run_model_eval

    out_file = tmp_path / "model.json"
    report = run_model_eval("rules", packs_dir="domain-packs", output_file=out_file)

    metrics = report["metrics"]
    assert metrics["top_3_count"] == metrics["baseline_top_3_count"]
    assert metrics["beats_baseline"] is False and metrics["passed_tc017"] is False
    assert all(s["rank"] == s["baseline_rank"] for s in report["scenarios"])
    assert json.loads(out_file.read_text(encoding="utf-8"))["model"] == "rules"
