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

from eval.runner import run_eval


def main() -> None:
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
    print("Results saved to eval/results.json")

    if not m["passed_tc017"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
