"""Evaluation runner for synthetic scenarios across domain packs.

Loads scenarios, evaluates cause framework hypotheses, computes per-scenario
and aggregate metrics, and outputs structured results to eval/results/results.json.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from agesoa_packs import evaluate_rules, load_packs, load_scenarios

from eval.evaluator import evaluate_hypotheses


def run_eval(
    packs_dir: str | Path = "domain-packs", output_file: str | Path = "eval/results/results.json"
) -> dict[str, Any]:
    """Run evaluation on all synthetic scenarios in domain packs and save metrics."""
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

    out_path = Path(output_file)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    return report
