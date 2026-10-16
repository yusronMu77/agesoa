"""One audit round of a case: hypotheses, witness questions and pattern tests, written to the audit trail with an
evidence status and evidence references.

The ranking and the status labels are rules (code + tests, `agesoa_packs.rank_branches` and `evidence_label`), so
text inside a report can never raise a status (TC-019, TC-029). Hypotheses are never a verdict: every label is capped
by the case's maximum finding status (the evidence deadline) and nothing becomes final without human validation.
A round runs whenever a source joins the case and whenever the reporter answers a question; what a previous round of
the same rule wrote (hypotheses, pattern tests) is replaced, questions and answers are kept.
"""

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from agesoa_packs import DomainPack, Incident, branch_metrics, field_text, group_value
from agesoa_platform.outbox import add_event
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from agesoa_case_audit.agent import TOP_N, LexicalRanker, Ranker
from agesoa_case_audit.cases import STATUS_ORDER, cap_status
from agesoa_case_audit.decisions import decision_event
from agesoa_case_audit.interview import sync_questions
from agesoa_case_audit.patterns import ACTOR as PATTERN_ACTOR
from agesoa_case_audit.patterns import MAX_GROUPS, WINDOW_DAYS, IncidentStore, check_pattern, window
from agesoa_case_audit.tables import audit_trail, case_sources, cases

ACTOR = "hypothesis_ranking"  # a rule, never a person
MAX_REFS = 20  # evidence references listed on one pattern test


@dataclass(frozen=True)
class LinkedSource:
    kind: str  # report | signal | answer
    id: str
    data: dict[
        str, Any
    ]  # the event data kept in case_sources.snapshot (no reporter id); {"text"} for an answer

    @property
    def ref(self) -> str:
        return f"{self.kind}:{self.id}"

    @property
    def evidence_ids(self) -> list[str]:
        return [e["evidence_id"] for e in self.data.get("evidence", [])]


@dataclass(frozen=True)
class Ranked:
    top: list[str]  # branches with a score, best first (at most TOP_N)
    order: list[str]  # every branch, best first: what the interview works through


def evidence_text(source: LinkedSource) -> str:
    """The words of a source the ranking may read: report field values, the signal summary or the reporter's
    answer. Data, never orders."""
    if source.kind == "signal":
        return str(source.data.get("summary", ""))
    if source.kind == "answer":
        return str(source.data.get("text", ""))
    return field_text(source.data.get("fields", {}))


def evidence_label(sources: list[LinkedSource]) -> str:
    """Highest evidence status the given sources can support (TC-019). 'proven' needs a lab result, which no source
    kind carries yet, so it is never produced here; symptoms alone stay 'alleged'; a stored evidence item (photo,
    voice note), a news signal or a second independent source reaches 'supported'. An answer is the reporter's own
    word again, so it never counts."""
    sources = [s for s in sources if s.kind != "answer"]
    if any(s.kind == "signal" or s.evidence_ids for s in sources) or len(sources) >= 2:
        return "supported"
    return "alleged"


def violated_rules(sources: list[LinkedSource]) -> set[str]:
    return {r["rule_id"] for s in sources for r in s.data.get("rule_results", []) if r.get("violated")}


async def load_sources(session: AsyncSession, case_id: str) -> list[LinkedSource]:
    """The reports and signals of the case, then the answers of its reporters."""
    linked = (
        await session.execute(
            select(case_sources.c.source_kind, case_sources.c.source_id, case_sources.c.snapshot)
            .where(case_sources.c.case_id == case_id)
            .order_by(case_sources.c.linked_at, case_sources.c.source_id)
        )
    ).all()
    answers = (
        await session.execute(
            select(audit_trail.c.content)
            .where(audit_trail.c.case_id == case_id, audit_trail.c.step == "answer")
            .order_by(audit_trail.c.id)
        )
    ).all()
    return [LinkedSource(kind, source_id, snapshot["data"]) for kind, source_id, snapshot in linked] + [
        LinkedSource("answer", a.content["question_id"], {"text": a.content["text"]}) for a in answers
    ]


async def run_round(
    session: AsyncSession,
    *,
    case_id: str,
    pack: DomainPack,
    store: IncidentStore,
    at: datetime,
    ranker: Ranker | None = None,
) -> None:
    """Rank the hypotheses (`ranker`: the model-backed Agen Audit, the lexical ranking by default), keep the
    interview going and test the patterns of the leading branches."""
    case = (await session.execute(select(cases).where(cases.c.id == case_id))).mappings().one()
    sources = await load_sources(session, case_id)
    ranked = await refresh_hypotheses(
        session,
        case_id=case_id,
        pack=pack,
        sources=sources,
        max_status=case["max_finding_status"],
        at=at,
        synthetic=case["synthetic"],
        ranker=ranker or LexicalRanker(),
    )
    await sync_questions(
        session,
        case_id=case_id,
        pack=pack,
        ranked_branches=ranked.order,
        at=at,
        synthetic=case["synthetic"],
    )
    await refresh_pattern_tests(
        session,
        case=case,
        pack=pack,
        store=store,
        sources=sources,
        branches=ranked.top,
        at=at,
    )


async def refresh_hypotheses(
    session: AsyncSession,
    *,
    case_id: str,
    pack: DomainPack,
    sources: list[LinkedSource],
    max_status: str,
    at: datetime,
    synthetic: bool,
    ranker: Ranker,
) -> Ranked:
    by_ref = {s.id: s for s in sources}
    result = await ranker.rank(
        pack, [(s.id, evidence_text(s)) for s in sources], violated_rules(sources), case_id=case_id
    )
    ranks, method = result.ranks, result.method
    top = [r for r in ranks if r.score > 0][:TOP_N]
    ranked = Ranked([r.branch for r in top], [r.branch for r in ranks])

    await session.execute(
        delete(audit_trail).where(
            audit_trail.c.case_id == case_id,
            audit_trail.c.step == "hypothesis",
            audit_trail.c.actor == ACTOR,
        )
    )
    rows = []
    for position, rank in enumerate(top, start=1):
        backing = [by_ref[i] for i in rank.supporting if i in by_ref]
        label = cap_status(evidence_label(backing), max_status) if backing else "alleged"
        refs = _unique(
            [r for s in backing for r in [s.ref, *s.evidence_ids]]
            + [f"rule:{r}" for r in rank.violated_rules]
        )
        rows.append(
            {
                "case_id": case_id,
                "step": "hypothesis",
                "branch": rank.branch,
                "content": {
                    "rank": position,
                    "label": rank.label,
                    "score": rank.score,
                    "method": method,
                    **(
                        {"reasoning": result.reasoning[rank.branch]}
                        if rank.branch in result.reasoning
                        else {}
                    ),
                    "supporting": list(rank.supporting),
                    "against": list(rank.against),
                    "violated_rules": list(rank.violated_rules),
                    "matched_terms": list(rank.matched_terms),
                },
                "status_label": label,
                "evidence_refs": refs,
                "actor": ACTOR,
                "created_at": at,
            }
        )
    if rows:
        await session.execute(audit_trail.insert(), rows)
    if not top:
        return ranked

    order = ", ".join(f"{r['content']['rank']}. {r['branch']} ({r['status_label']})" for r in rows)
    reason = (
        f"Ranked {len(ranks)} cause branches against {len(sources)} source(s) with the {method} method: {order}. "
        "These are hypotheses to test, not a verdict."
    )
    await add_event(
        session,
        decision_event(
            case_id,
            "hypotheses:" + ",".join(sorted(s.ref for s in sources)) + ">" + ",".join(r.branch for r in top),
            action="audit.hypotheses_ranked",
            rule=ACTOR,
            reason=reason,
            refs=_unique([ref for r in rows for ref in r["evidence_refs"] if not ref.startswith("rule:")]),
            at=at,
            synthetic=synthetic,
            status_label=max((r["status_label"] for r in rows), key=STATUS_ORDER.__getitem__),
        ),
    )
    return ranked


async def refresh_pattern_tests(
    session: AsyncSession,
    *,
    case: Any,
    pack: DomainPack,
    store: IncidentStore,
    sources: list[LinkedSource],
    branches: list[str],
    at: datetime,
) -> None:
    """Test every metric of the leading branches for the group values (kitchen, supplier, ...) of the case's own
    reports, and write the results as `pattern_test` steps. Replaces the previous results of this rule."""
    case_id = case["id"]
    own = [
        Incident(s.id, case_id, s.data.get("fields", {}), tuple(s.data.get("rule_results", [])))
        for s in sources
        if s.kind == "report"
    ]
    start, until = window(case["occurred_at"], at)
    rows: list[dict[str, Any]] = []
    for branch in branches:
        for metric in branch_metrics(pack, branch):
            field = metric["params"]["group_by"]
            groups = sorted({g for i in own if (g := group_value(i.fields.get(field))) is not None})
            for group in groups[:MAX_GROUPS]:
                test = await check_pattern(
                    session,
                    store,
                    pack,
                    case_id=case_id,
                    domain=case["domain"],
                    own=own,
                    branch=branch,
                    metric_id=metric["id"],
                    group=group,
                    window_start=start,
                    until=until,
                )
                result = test.result
                rows.append(
                    {
                        "case_id": case_id,
                        "step": "pattern_test",
                        "branch": branch,
                        "content": {
                            "metric": metric["id"],
                            "kind": metric["kind"],
                            "label": metric["label"],
                            "group_by": result.group_by,
                            "group_value": result.group_value,
                            "value": result.value,
                            "incidents": result.n,
                            "other_cases": len(result.other_cases),
                            "recurs": result.recurs,
                            "window_days": WINDOW_DAYS,
                            "store": test.store,
                        },
                        "status_label": cap_status(test.status, case["max_finding_status"]),
                        "evidence_refs": [f"report:{i}" for i in result.incidents[:MAX_REFS]],
                        "actor": PATTERN_ACTOR,
                        "created_at": at,
                    }
                )
    await session.execute(
        delete(audit_trail).where(
            audit_trail.c.case_id == case_id,
            audit_trail.c.step == "pattern_test",
            audit_trail.c.actor == PATTERN_ACTOR,
        )
    )
    if not rows:
        return
    await session.execute(audit_trail.insert(), rows)
    recurring = [r for r in rows if r["content"]["recurs"]]
    fingerprint = json.dumps(
        [
            [r["branch"], r["content"]["metric"], r["content"]["value"], r["content"]["other_cases"]]
            for r in rows
        ],
        sort_keys=True,
    )
    await add_event(
        session,
        decision_event(
            case_id,
            "patterns:" + hashlib.sha256(fingerprint.encode()).hexdigest()[:16],
            action="audit.patterns_tested",
            rule=PATTERN_ACTOR,
            reason=(
                f"Tested {len(rows)} fixed pattern metric(s) on the leading cause branches against the "
                f"{store.name} archive: {len(recurring)} recur in other cases. "
                "A pattern that recurs supports a hypothesis; it is not a verdict."
            ),
            refs=_unique([ref for r in rows for ref in r["evidence_refs"]]),
            at=at,
            synthetic=case["synthetic"],
            status_label=max((r["status_label"] for r in rows), key=STATUS_ORDER.__getitem__),
        ),
    )


def _unique(items: list[str]) -> list[str]:
    return list(dict.fromkeys(items))
