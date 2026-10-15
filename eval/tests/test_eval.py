"""Tests for the synthetic scenario evaluation harness."""

from __future__ import annotations

import json
from pathlib import Path

from eval.runner import run_eval


def test_eval_harness_runs_and_passes_tc017(tmp_path: Path):
    out_file = tmp_path / "results.json"
    report = run_eval(packs_dir="domain-packs", output_file=out_file)

    metrics = report["metrics"]
    assert metrics["total_scenarios"] >= 5
    assert metrics["top_3_count"] >= 5
    assert metrics["passed_tc017"] is True
    assert metrics["deterministic"] is True
    assert 0.0 <= metrics["mrr"] <= 1.0


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
