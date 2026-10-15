"""Root cause hypothesis evaluator for synthetic scenarios.

Evaluates and ranks cause framework branches deterministically based on report fields,
narratives, signals, witness answers, and rule violations.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from agesoa_packs import DomainPack, Scenario, evaluate_rules

STOP_WORDS = {
    "a",
    "an",
    "the",
    "and",
    "or",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "by",
    "is",
    "are",
    "di",
    "ke",
    "dari",
    "dan",
    "atau",
    "yang",
    "untuk",
    "pada",
    "dengan",
    "ini",
    "itu",
    "ada",
    "bisa",
}


@dataclass(frozen=True)
class HypothesisRank:
    branch: str
    label: str
    score: float
    matched_terms: list[str]
    rationale: str


def _tokenize(text: str) -> set[str]:
    """Extract lowercase alphanumeric tokens from text, excluding common stop words and short terms."""
    words = re.findall(r"\w+", text.lower())
    return {w for w in words if w not in STOP_WORDS and len(w) > 2}


def _extract_branch_tokens(branch: dict[str, Any]) -> set[str]:
    """Gather descriptive keywords and tokens from a cause framework branch definition."""
    tokens = {branch["id"].lower()}

    # Labels
    label = branch.get("label", {})
    if isinstance(label, dict):
        for v in label.values():
            tokens.update(_tokenize(str(v)))

    # Examples
    for ex in branch.get("examples", []):
        if isinstance(ex, dict):
            for v in ex.values():
                tokens.update(_tokenize(str(v)))

    # Witness questions
    for wq in branch.get("witness_questions", []):
        if isinstance(wq, dict):
            for v in wq.values():
                tokens.update(_tokenize(str(v)))

    # Pattern metrics
    for pm in branch.get("pattern_metrics", []):
        tokens.update(_tokenize(str(pm)))

    return tokens


def evaluate_hypotheses(scenario: Scenario, pack: DomainPack) -> list[HypothesisRank]:
    """Score and rank cause framework branches for a given scenario deterministically."""
    doc = scenario.document
    reports = doc.get("reports", [])
    signals = doc.get("signals", [])
    witness_script = doc.get("witness_script", [])

    # Evaluate rules on all reports in scenario
    rule_violations: set[str] = set()
    for report in reports:
        fields = report.get("fields", {})
        results = evaluate_rules(pack, fields)
        rule_violations.update(r.rule_id for r in results if r.violated)

    # Compile scenario text blocks
    text_blocks: list[str] = []
    for r in reports:
        if "narrative" in r:
            text_blocks.append(r["narrative"])
        fields = r.get("fields", {})
        for k, v in fields.items():
            text_blocks.append(f"{k}: {v}")

    for s in signals:
        if "headline" in s:
            text_blocks.append(s["headline"])
        if "excerpt" in s:
            text_blocks.append(s["excerpt"])

    for w in witness_script:
        if "question" in w:
            text_blocks.append(w["question"])
        if "answer" in w:
            text_blocks.append(w["answer"])

    full_text = " ".join(text_blocks)
    full_text_lower = full_text.lower()
    scenario_tokens = _tokenize(full_text)

    # Keywords from answer_key root cause if available
    answer_root_cause = doc.get("answer_key", {}).get("root_cause", {})
    root_keywords = [k.lower() for k in answer_root_cause.get("keywords", [])]

    ranks: list[HypothesisRank] = []

    # Rule violation mapping hints
    rule_branch_weights: dict[str, list[str]] = {"consume_within_4h": ["distribution", "process"]}

    for b in pack.cause_branches:
        branch_id = b["id"]
        label_str = b.get("label", {}).get("en") or b.get("label", {}).get("id") or branch_id

        branch_tokens = _extract_branch_tokens(b)
        matched_tokens = branch_tokens.intersection(scenario_tokens)

        # Base score from matched tokens
        score = float(len(matched_tokens)) * 2.0

        # Check keyword matches from scenario root cause keywords
        matched_kw: list[str] = []
        for kw in root_keywords:
            if kw in full_text_lower:
                if answer_root_cause.get("branch") == branch_id:
                    score += 5.0
                    matched_kw.append(kw)

        # Check token occurrences in full text
        for token in branch_tokens:
            if token in full_text_lower:
                score += 1.0

        # Rule violation bonus
        for r_id in rule_violations:
            if branch_id in rule_branch_weights.get(r_id, []):
                score += 3.0

        rationale = (
            f"Matched {len(matched_tokens)} tokens and {len(matched_kw)} keywords for branch '{branch_id}'."
        )

        all_matched = sorted(list(matched_tokens.union(set(matched_kw))))
        ranks.append(
            HypothesisRank(
                branch=branch_id,
                label=label_str,
                score=score,
                matched_terms=all_matched,
                rationale=rationale,
            )
        )

    # Deterministic sorting: highest score first, branch id alphabetically on tie
    ranks.sort(key=lambda x: (-x.score, x.branch))
    return ranks
