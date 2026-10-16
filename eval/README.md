# eval

Evaluation harness for synthetic scenarios across domain packs.

## Overview

The evaluation harness loads synthetic scenarios defined in domain packs (e.g. `domain-packs/mbg/scenarios/*.json`), evaluates cause framework branches against evidence (report narratives, report fields, signals, and witness testimony), computes accuracy metrics, and writes results to `eval/results/results.json`.

## Quick Start

Run all synthetic scenario evaluations with a single command:

```sh
uv run eval
# or
uv run python -m eval
```

Put the same scenarios to the audit agent and compare with the lexical baseline (TC-017):

```sh
uv run eval --model rules                # the lexical ranking through the agent path: no model call, no cost
uv run eval --model <gemini model id>    # a real model: one billable call per scenario; needs Vertex/API credentials
```

A model run writes `eval/results/model-<model>.json` and passes TC-017 only when the planted cause is in the top 3
for at least 5 scenarios **and** more often than the lexical baseline. It never runs in CI.

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

## What is measured

The harness calls `agesoa_packs.rank_branches`, the same deterministic ranking the case-audit service writes to the
audit trail. It reads report narratives and field values, signal text and witness *answers* (a question is the
agent's own wording, so it is not evidence) and never the answer key. It is a lexical prior, a baseline for the
model-written hypotheses, not the target: per 2026-10-16 it puts the planted cause in the top 3 for 3 of 6
scenarios (top 1: 1 of 6), so `passed_tc017` is `false`. Six scenarios are too few to tune on; do not add
scenario-specific words to the pack to raise this number.

## Output Format

Results are saved to `eval/results/results.json`. The output JSON contains aggregate metrics and per-scenario breakdowns:

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
