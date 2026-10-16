"""Hypotheses of a case: the cause_framework branches of the domain pack ranked against the case's reports and
signals, written to the audit trail with an evidence status and evidence references.

The ranking and the status labels are rules (code + tests, `agesoa_packs.rank_branches` and `evidence_label`), so
text inside a report can never raise a status (TC-019, TC-029). Hypotheses are never a verdict: every label is capped
by the case's maximum finding status (the evidence deadline) and nothing becomes final without human validation.
Rankings are recomputed whenever a source joins the case; the previous hypotheses of this ranker are replaced.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from agesoa_packs import DomainPack, field_text, rank_branches
from agesoa_platform.outbox import add_event
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from agesoa_case_audit.cases import STATUS_ORDER, cap_status
from agesoa_case_audit.decisions import decision_event
from agesoa_case_audit.tables import audit_trail

ACTOR = "hypothesis_ranking"  # a rule, never a person
TOP_N = 3
METHOD = "lexical"  # the deterministic ranking; a model-written ranking would say so here


@dataclass(frozen=True)
class LinkedSource:
    kind: str  # report | signal
    id: str
    data: dict[str, Any]  # the event data kept in case_sources.snapshot (no reporter id)

    @property
    def ref(self) -> str:
        return f"{self.kind}:{self.id}"

    @property
    def evidence_ids(self) -> list[str]:
        return [e["evidence_id"] for e in self.data.get("evidence", [])]


def evidence_text(source: LinkedSource) -> str:
    """The words of a source the ranking may read: report field values or the signal summary. Data, never orders."""
    if source.kind == "signal":
        return str(source.data.get("summary", ""))
    return field_text(source.data.get("fields", {}))


def evidence_label(sources: list[LinkedSource]) -> str:
    """Highest evidence status the given sources can support (TC-019). 'proven' needs a lab result, which no source
    kind carries yet, so it is never produced here; symptoms alone stay 'alleged'; a stored evidence item (photo,
    voice note), a news signal or a second independent source reaches 'supported'."""
    if any(s.kind == "signal" or s.evidence_ids for s in sources) or len(sources) >= 2:
        return "supported"
    return "alleged"


def violated_rules(sources: list[LinkedSource]) -> set[str]:
    return {r["rule_id"] for s in sources for r in s.data.get("rule_results", []) if r.get("violated")}


async def refresh_hypotheses(
    session: AsyncSession,
    *,
    case_id: str,
    pack: DomainPack,
    sources: list[LinkedSource],
    max_status: str,
    at: datetime,
    synthetic: bool,
) -> None:
    by_ref = {s.id: s for s in sources}
    ranks = rank_branches(pack, [(s.id, evidence_text(s)) for s in sources], violated_rules(sources))
    top = [r for r in ranks if r.score > 0][:TOP_N]

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
                    "method": METHOD,
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
        return

    order = ", ".join(f"{r['content']['rank']}. {r['branch']} ({r['status_label']})" for r in rows)
    reason = (
        f"Ranked {len(ranks)} cause branches against {len(sources)} source(s) with the {METHOD} method: {order}. "
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


def _unique(items: list[str]) -> list[str]:
    return list(dict.fromkeys(items))
