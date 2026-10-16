"""Deterministic ranking of the cause_framework branches of a domain pack against the evidence of a case.

The ranking is a business rule (code + tests), not a prompt: the same evidence always gives the same order, and the
evidence text is only ever data. It is a lexical prior, not an understanding of the case: it is the fallback when the
audit agent (a model) is not available, and the baseline the agent has to beat in the eval.

Score of a branch = sum over its vocabulary terms found in the evidence of idf(term) * (1 + ln(occurrences)),
divided by sqrt(vocabulary size), plus RULE_BONUS per violated rule that supports it. A term only one branch uses
says more than a term every branch uses (idf), and a branch with a long vocabulary gets no head start (norm). The eval harness and the case-audit service call this one function, so the number
in the README is the number the service produces. Domain-agnostic: branches, rules and their `supports_branch`
link come from the pack.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Any

from agesoa_packs.loader import DomainPack

# Function words and question words are not evidence: pack questions use them, reports use them, they say nothing.
STOP_WORDS = frozenset(
    "a an the and or in on at to for of with by is are was were has have been did does any there than that this "
    "what when how who which from their its above below di ke dari dan atau yang untuk pada dengan ini itu ada "
    "bisa apakah apa bagaimana berapa siapa kapan mengapa sudah masih akan saat oleh adalah juga dalam sampai "
    "tidak tak bukan belum tanpa no not without never none".split()
)
NEGATIONS = frozenset("tidak tak bukan belum tanpa no not without never none".split())
NEGATION_WINDOW = 4  # a branch term counts as denied when a negation is among the 4 words before it
RULE_BONUS = 0.3  # a violated rule that supports a branch adds this to its score (a keyword hit adds 0.1-0.5)


@dataclass(frozen=True)
class BranchRank:
    branch: str
    label: dict[str, str]
    score: float
    matched_terms: tuple[str, ...]
    supporting: tuple[str, ...]  # ids of the sources that mention a branch term
    against: tuple[str, ...]  # ids of the sources that only mention a branch term in a negated context
    violated_rules: tuple[str, ...]  # ids of the violated rules that point at this branch


def tokenize(text: str) -> set[str]:
    """Lowercase alphanumeric terms without stop words and terms shorter than 3 characters."""
    return {w for w in re.findall(r"\w+", text.lower()) if w not in STOP_WORDS and len(w) > 2}


def field_text(fields: dict[str, Any]) -> str:
    """The words of a report's field values (text and lists of text). Field names and numbers are structure, not evidence."""
    parts: list[str] = []
    for value in fields.values():
        if isinstance(value, str):
            parts.append(value)
        elif isinstance(value, list):
            parts.extend(str(v) for v in value)
    return " ".join(parts)


def branch_terms(branch: dict[str, Any]) -> set[str]:
    """The vocabulary of a branch: its id, labels, examples, witness questions and pattern metrics."""
    terms = {branch["id"].lower()}
    for item in [branch.get("label", {}), *branch.get("examples", []), *branch.get("witness_questions", [])]:
        if isinstance(item, dict):
            for value in item.values():
                terms.update(tokenize(str(value)))
    for metric in branch.get("pattern_metrics", []):
        terms.update(tokenize(str(metric)))
    return terms


def rank_branches(
    pack: DomainPack,
    sources: Sequence[tuple[str, str]],
    violated_rules: Iterable[str] = (),
) -> list[BranchRank]:
    """Rank the branches, best first (ties by branch id). `sources` are (source id, text) pairs."""
    words = Counter(w for _, text in sources for w in re.findall(r"\w+", text.lower()))
    vocabulary = {b["id"]: branch_terms(b) for b in pack.cause_branches}
    branch_count = len(vocabulary)
    spread = Counter(term for terms in vocabulary.values() for term in terms)
    violated = set(violated_rules)
    rule_branch = {r["id"]: r.get("supports_branch") for r in pack.rules}

    ranks: list[BranchRank] = []
    for branch in pack.cause_branches:
        terms = vocabulary[branch["id"]]
        found = {t: words[t] for t in terms if words[t] and t not in STOP_WORDS and len(t) > 2}
        weight = sum(math.log(1 + branch_count / spread[t]) * (1 + math.log(n)) for t, n in found.items())
        rules = tuple(sorted(r for r in violated if rule_branch.get(r) == branch["id"]))
        score = weight / math.sqrt(len(terms)) + RULE_BONUS * len(rules)
        supporting, against = _split_sources(sources, terms)
        label = branch.get("label", {})
        ranks.append(
            BranchRank(
                branch=branch["id"],
                label=label if isinstance(label, dict) else {"en": str(label)},
                score=round(score, 4),
                matched_terms=tuple(sorted(found)),
                supporting=supporting,
                against=against,
                violated_rules=rules,
            )
        )
    ranks.sort(key=lambda r: (-r.score, r.branch))
    return ranks


def _split_sources(
    sources: Sequence[tuple[str, str]], terms: set[str]
) -> tuple[tuple[str, ...], tuple[str, ...]]:
    supporting: list[str] = []
    against: list[str] = []
    for source_id, text in sources:
        words = re.findall(r"\w+", text.lower())
        hits = [i for i, w in enumerate(words) if w in terms and w not in STOP_WORDS and len(w) > 2]
        if not hits:
            continue
        denied = [i for i in hits if NEGATIONS.intersection(words[max(0, i - NEGATION_WINDOW) : i])]
        (against if len(denied) == len(hits) else supporting).append(source_id)
    return tuple(supporting), tuple(against)
