# eval

Evaluation harness for synthetic scenarios across domain packs.

## Overview

The evaluation harness loads synthetic scenarios defined in domain packs (e.g. `domain-packs/mbg/scenarios/*.json`), evaluates cause framework branches against evidence (report narratives, report fields, signals, witness testimony, and rule violations), computes accuracy metrics, and writes results to `eval/results.json`.

## Quick Start

Run all synthetic scenario evaluations with a single command:

```sh
uv run eval
# or
uv run python -m eval
```

Run tests for the evaluation harness:

```sh
uv run pytest -q eval/tests
```

## Metrics & Acceptance Criteria (TC-017)

The harness evaluates acceptance test **TC-017**:
* **Criterion**: The planted root cause appears in the Top 3 hypotheses for 5–8 synthetic scenarios (`passed_tc017`).
* **Metrics calculated**:
  * `total_scenarios`: Number of scenarios evaluated.
  * `top_3_count`: Count of scenarios where the planted root cause branch ranks in the top 3.
  * `top_1_count`: Count of scenarios where the planted root cause branch ranks #1.
  * `top_3_accuracy`: Ratio of `top_3_count / total_scenarios`.
  * `top_1_accuracy`: Ratio of `top_1_count / total_scenarios`.
  * `mrr`: Mean Reciprocal Rank ($1/\text{rank}$) across all scenarios.
  * `deterministic`: True (the evaluation produces reproducible results).

## Output Format

Results are saved to `eval/results.json`. The output JSON contains aggregate metrics and per-scenario breakdowns:

```json
{
  "schema_version": 1,
  "metrics": {
    "total_scenarios": 6,
    "top_3_count": 6,
    "top_1_count": 4,
    "top_3_accuracy": 1.0,
    "top_1_accuracy": 0.6667,
    "mrr": 0.7778,
    "passed_tc017": true,
    "deterministic": true
  },
  "scenarios": [ ... ]
}
```
