"""Root cause hypothesis evaluator for synthetic scenarios.

Adapter around `agesoa_packs.rank_branches`, the same ranking the case-audit service uses: it only turns a scenario
document (reports, signals, witness script) into the sources and violated rules the ranking takes.
The answer key is never an input: it is the ground truth the ranking is compared with (runner.py).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from agesoa_packs import BranchRank, DomainPack, Scenario, evaluate_rules, field_text, rank_branches

if TYPE_CHECKING:
    from agesoa_case_audit.agent import Ranker


@dataclass(frozen=True)
class HypothesisRank:
    branch: str
    label: str
    score: float
    matched_terms: list[str]
    rationale: str


def scenario_sources(scenario: Scenario) -> list[tuple[str, str]]:
    """(source id, text) for every report, signal and witness exchange of the scenario."""
    doc = scenario.document
    sources: list[tuple[str, str]] = []
    for i, report in enumerate(doc.get("reports", [])):
        parts = [report["narrative"]] if "narrative" in report else []
        parts.append(field_text(report.get("fields", {})))
        sources.append((report.get("ref", f"report-{i}"), " ".join(parts)))
    for i, signal in enumerate(doc.get("signals", [])):
        parts = [signal[k] for k in ("headline", "excerpt") if k in signal]
        sources.append((signal.get("ref", f"signal-{i}"), " ".join(parts)))
    for i, turn in enumerate(doc.get("witness_script", [])):
        # Only the answer is evidence: the question is the agent's own wording, counting it would be circular.
        if "answer" in turn:
            sources.append((f"witness-{i}", turn["answer"]))
    return sources


def scenario_violated_rules(scenario: Scenario, pack: DomainPack) -> set[str]:
    return {
        result.rule_id
        for report in scenario.document.get("reports", [])
        for result in evaluate_rules(pack, report.get("fields", {}))
        if result.violated
    }


def evaluate_hypotheses(scenario: Scenario, pack: DomainPack) -> list[HypothesisRank]:
    """Score and rank cause framework branches for a given scenario deterministically."""
    ranks = rank_branches(pack, scenario_sources(scenario), scenario_violated_rules(scenario, pack))
    return _hypothesis_ranks(ranks)


async def evaluate_with_ranker(scenario: Scenario, pack: DomainPack, ranker: Ranker) -> list[HypothesisRank]:
    """The same ranking question put to the audit agent (`agesoa_case_audit.agent`): the hypotheses it keeps come
    first, then the remaining branches in lexical order. It gets what the service gets, never the answer key."""
    result = await ranker.rank(pack, scenario_sources(scenario), scenario_violated_rules(scenario, pack))
    return _hypothesis_ranks(result.ranks, result.reasoning)


def _hypothesis_ranks(
    ranks: list[BranchRank], reasoning: dict[str, str] | None = None
) -> list[HypothesisRank]:
    reasoning = reasoning or {}
    return [
        HypothesisRank(
            branch=r.branch,
            label=r.label.get("en") or r.label.get("id") or r.branch,
            score=r.score,
            matched_terms=list(r.matched_terms),
            rationale=reasoning.get(r.branch)
            or f"Matched {len(r.matched_terms)} tokens for branch '{r.branch}'.",
        )
        for r in ranks
    ]
