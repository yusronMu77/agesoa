"""CLI entrypoint for running synthetic scenario evaluations.

Usage:
    uv run python -m eval
    uv run eval
"""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure repo root is in sys.path when invoked directly as a script
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from eval.runner import run_eval, run_model_eval


def main() -> None:
    args = sys.argv[1:]
    if args[:1] == ["--model"] and len(args) == 2:
        return model_main(args[1])
    if args:
        sys.exit("usage: uv run eval [--model <gemini model id | rules>]")
    print("Running evaluation harness on synthetic scenarios...")
    report = run_eval()
    m = report["metrics"]
    print(f"Evaluated {m['total_scenarios']} scenario(s):")
    print(
        f"  Top-3 Count: {m['top_3_count']} / {m['total_scenarios']} (Accuracy: {m['top_3_accuracy'] * 100:.1f}%)"
    )
    print(
        f"  Top-1 Count: {m['top_1_count']} / {m['total_scenarios']} (Accuracy: {m['top_1_accuracy'] * 100:.1f}%)"
    )
    print(f"  MRR: {m['mrr']:.4f}")
    print(f"  TC-017 Passed: {'YES' if m['passed_tc017'] else 'NO'}")
    print("Results saved to eval/results/results.json")

    if not m["passed_tc017"]:
        sys.exit(1)


def model_main(model: str) -> None:
    print(f"Putting the synthetic scenarios to the audit agent (model: {model})...")
    report = run_model_eval(model)
    m = report["metrics"]
    print(
        f"  Top-3: {m['top_3_count']} / {m['total_scenarios']} (lexical baseline: {m['baseline_top_3_count']})"
    )
    print(f"  Top-1: {m['top_1_count']} / {m['total_scenarios']}")
    print(f"  MRR: {m['mrr']:.4f} (lexical baseline: {m['baseline_mrr']:.4f})")
    print(f"  TC-017 Passed: {'YES' if m['passed_tc017'] else 'NO'}")
    print(f"Results saved to eval/results/model-{model}.json")
    if not m["passed_tc017"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
