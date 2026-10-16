"""Evaluation runner for synthetic scenarios across domain packs.

Loads scenarios, evaluates cause framework hypotheses, computes per-scenario
and aggregate metrics, and outputs structured results to eval/results/results.json.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

from agesoa_packs import evaluate_rules, load_packs, load_scenarios

from eval.evaluator import evaluate_hypotheses, evaluate_with_ranker


def run_eval(
    packs_dir: str | Path = "domain-packs", output_file: str | Path | None = "eval/results/results.json"
) -> dict[str, Any]:
    """Run evaluation on all synthetic scenarios in domain packs and save metrics (`output_file=None`: don't)."""
    root = Path(packs_dir)
    if not root.is_dir():
        raise FileNotFoundError(f"Domain packs directory not found: {root}")

    packs = load_packs(root)
    scenarios_list: list[tuple[Any, Any]] = []

    for pack in packs.values():
        scenarios = load_scenarios(pack)
        for scenario in scenarios.values():
            scenarios_list.append((pack, scenario))

    scenarios_results: list[dict[str, Any]] = []
    top_3_count = 0
    top_1_count = 0
    reciprocal_ranks: list[float] = []

    for pack, scenario in scenarios_list:
        doc = scenario.document
        answer_key = scenario.answer_key
        planted_cause = answer_key["root_cause"]
        planted_branch = planted_cause["branch"]

        hypotheses = evaluate_hypotheses(scenario, pack)

        # Find rank of planted root cause branch
        rank = next((i + 1 for i, h in enumerate(hypotheses) if h.branch == planted_branch), None)
        if rank is None:
            rank = len(hypotheses) + 1

        in_top_3 = rank <= 3
        if in_top_3:
            top_3_count += 1
        if rank == 1:
            top_1_count += 1

        rr = 1.0 / rank
        reciprocal_ranks.append(rr)

        # Evaluated rule violations
        rule_violations: list[str] = []
        for report in doc.get("reports", []):
            results = evaluate_rules(pack, report.get("fields", {}))
            rule_violations.extend(r.rule_id for r in results if r.violated)
        rule_violations = sorted(list(set(rule_violations)))

        scenarios_results.append(
            {
                "scenario_id": scenario.id,
                "pack": scenario.pack,
                "title": doc.get("title", {}).get("en", scenario.id),
                "planted_root_cause": {
                    "branch": planted_branch,
                    "statement": planted_cause.get("statement", ""),
                },
                "rank": rank,
                "in_top_3": in_top_3,
                "reciprocal_rank": round(rr, 4),
                "evaluated_rule_violations": rule_violations,
                "expected_rule_violations": answer_key.get("expected_rule_violations", []),
                "ranked_hypotheses": [
                    {
                        "rank": idx + 1,
                        "branch": h.branch,
                        "label": h.label,
                        "score": h.score,
                        "rationale": h.rationale,
                    }
                    for idx, h in enumerate(hypotheses)
                ],
            }
        )

    total = len(scenarios_results)
    top_3_acc = (top_3_count / total) if total > 0 else 0.0
    top_1_acc = (top_1_count / total) if total > 0 else 0.0
    mrr = (sum(reciprocal_ranks) / total) if total > 0 else 0.0

    # TC-017 requirement: Planted root cause appears in top 3 on 5-8 scenarios
    passed_tc017 = 5 <= top_3_count <= 8 if 5 <= total <= 8 else top_3_count >= 5

    aggregate_metrics = {
        "total_scenarios": total,
        "top_3_count": top_3_count,
        "top_1_count": top_1_count,
        "top_3_accuracy": round(top_3_acc, 4),
        "top_1_accuracy": round(top_1_acc, 4),
        "mrr": round(mrr, 4),
        "passed_tc017": passed_tc017,
        "deterministic": True,
    }

    report = {
        "schema_version": 1,
        "metrics": aggregate_metrics,
        "scenarios": scenarios_results,
    }

    if output_file is not None:
        out_path = Path(output_file)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    return report


def run_model_eval(
    model: str,
    packs_dir: str | Path = "domain-packs",
    output_file: str | Path | None = None,
    *,
    ranker: Any = None,
) -> dict[str, Any]:
    """Put the same scenarios to the audit agent (`model`: a Gemini model id, or `rules`) and compare with the
    lexical baseline. TC-017 passes when the agent puts the planted cause in the top 3 on at least 5 scenarios AND
    beats the baseline: a model that only matches the keyword ranking adds nothing. Never run on every commit: a
    Gemini model is a billable call per scenario."""
    # Imported here: the lexical baseline needs no service package, only a model run does.
    from agesoa_case_audit.agent import AuditAgent

    baseline = run_eval(packs_dir, output_file=None)
    agent = ranker or AuditAgent(model)
    packs = load_packs(Path(packs_dir))

    async def rank_all() -> list[tuple[str, Any, Any]]:
        rows = []
        for pack in packs.values():
            for scenario in load_scenarios(pack).values():
                rows.append((scenario, pack, await evaluate_with_ranker(scenario, pack, agent)))
        return rows

    scenarios: list[dict[str, Any]] = []
    ranks: list[int] = []
    by_id = {s["scenario_id"]: s for s in baseline["scenarios"]}
    for scenario, _pack, hypotheses in asyncio.run(rank_all()):
        planted = scenario.answer_key["root_cause"]["branch"]
        rank = next((i + 1 for i, h in enumerate(hypotheses) if h.branch == planted), len(hypotheses) + 1)
        ranks.append(rank)
        scenarios.append(
            {
                "scenario_id": scenario.id,
                "planted_root_cause": planted,
                "rank": rank,
                "baseline_rank": by_id[scenario.id]["rank"],
                "in_top_3": rank <= 3,
                "ranked_hypotheses": [
                    {"rank": i + 1, "branch": h.branch, "scored": h.score > 0, "rationale": h.rationale}
                    for i, h in enumerate(hypotheses)
                ],
            }
        )
    total = len(ranks)
    top_3 = sum(r <= 3 for r in ranks)
    base = baseline["metrics"]
    metrics = {
        "total_scenarios": total,
        "top_3_count": top_3,
        "top_1_count": sum(r == 1 for r in ranks),
        "top_3_accuracy": round(top_3 / total, 4) if total else 0.0,
        "top_1_accuracy": round(sum(r == 1 for r in ranks) / total, 4) if total else 0.0,
        "mrr": round(sum(1 / r for r in ranks) / total, 4) if total else 0.0,
        "baseline_top_3_count": base["top_3_count"],
        "baseline_mrr": base["mrr"],
        "beats_baseline": top_3 > base["top_3_count"],
        "passed_tc017": top_3 >= 5 and top_3 > base["top_3_count"],
    }
    report = {"schema_version": 1, "model": model, "metrics": metrics, "scenarios": scenarios}
    out_path = Path(output_file or f"eval/results/model-{model}.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report
