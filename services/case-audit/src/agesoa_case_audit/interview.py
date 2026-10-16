"""Witness interview: the questions an audit puts to the reporter of a case, and the answers that come back.

Which question comes next is a rule (code + tests), not a prompt: questions come from the `witness_questions` of the
domain pack's cause branches, in the order of the current hypothesis ranking, and a case keeps at most TARGET_OPEN
of them waiting for an answer and MAX_QUESTIONS in total. A model-written question would use the same audit-trail
step; this planner is the scripted fallback (T2) and the baseline.

Questions and answers are audit-trail steps (`question`, `answer`). A question is addressed to the reporter of a
report of the case: the service keeps only the pseudonymous `reporter_ref`, and the answer is accepted only from
that reporter. An answer is the reporter's own word, so it is labelled `alleged` and can never lift a finding.
"""

from __future__ import annotations

import hashlib
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from agesoa_packs import DomainPack
from agesoa_platform.outbox import add_event
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agesoa_case_audit.decisions import decision_event
from agesoa_case_audit.tables import audit_trail, case_sources, cases

PLANNER = "interview_planner"  # a rule, never a person
WITNESS = "witness"  # the role of whoever answers; never a name
TARGET_OPEN = 2  # unanswered questions that wait for the reporter
MAX_QUESTIONS = 6  # asked per case, answered or not


class InterviewError(ValueError):
    """The answer cannot be accepted; `kind` tells the API which status to return."""

    def __init__(self, kind: str, message: str):
        self.kind = kind  # unknown | answered
        super().__init__(message)


@dataclass(frozen=True)
class PlannedQuestion:
    question_id: str
    branch: str
    key: str  # branch + position in the branch's list: the same question is never asked twice
    text: dict[str, str]


def question_id(case_id: str, key: str) -> str:
    return "Q-" + hashlib.sha256(f"{case_id}|{key}".encode()).hexdigest()[:20]


def plan_questions(
    pack: DomainPack,
    case_id: str,
    ranked_branches: Sequence[str],
    *,
    asked_keys: set[str],
    open_count: int,
) -> list[PlannedQuestion]:
    """The next questions: not yet asked, from the best-ranked branches first, topping the open ones up to
    TARGET_OPEN and never exceeding MAX_QUESTIONS asked in total."""
    room = min(TARGET_OPEN - open_count, MAX_QUESTIONS - len(asked_keys))
    branches = {b["id"]: b for b in pack.cause_branches}
    planned: list[PlannedQuestion] = []
    for branch_id in ranked_branches:
        for index, text in enumerate(branches[branch_id].get("witness_questions", [])):
            key = f"{branch_id}:{index}"
            if len(planned) >= room:
                return planned
            if key not in asked_keys:
                planned.append(PlannedQuestion(question_id(case_id, key), branch_id, key, dict(text)))
    return planned


async def sync_questions(
    session: AsyncSession,
    *,
    case_id: str,
    pack: DomainPack,
    ranked_branches: Sequence[str],
    at: datetime,
    synthetic: bool,
) -> list[PlannedQuestion]:
    """Ask what is still open for this case. Idempotent: without a reporter to ask, or with enough questions
    waiting already, nothing happens."""
    reporters = (
        await session.execute(
            select(case_sources.c.source_id).where(
                case_sources.c.case_id == case_id,
                case_sources.c.source_kind == "report",
                case_sources.c.reporter_ref.is_not(None),
            )
        )
    ).all()
    if not reporters:
        return []
    steps = (
        (
            await session.execute(
                select(audit_trail.c.step, audit_trail.c.content).where(
                    audit_trail.c.case_id == case_id, audit_trail.c.step.in_(("question", "answer"))
                )
            )
        )
        .mappings()
        .all()
    )
    asked = {s["content"]["key"]: s["content"]["question_id"] for s in steps if s["step"] == "question"}
    answered = {s["content"]["question_id"] for s in steps if s["step"] == "answer"}
    open_count = sum(1 for q in asked.values() if q not in answered)
    planned = plan_questions(pack, case_id, ranked_branches, asked_keys=set(asked), open_count=open_count)
    for q in planned:
        await session.execute(
            audit_trail.insert().values(
                case_id=case_id,
                step="question",
                branch=q.branch,
                content={"question_id": q.question_id, "key": q.key, "text": q.text, "method": "pack"},
                status_label=None,
                evidence_refs=[f"report:{r.source_id}" for r in reporters],
                actor=PLANNER,
                created_at=at,
            )
        )
        await add_event(
            session,
            decision_event(
                case_id,
                f"question:{q.question_id}",
                action="audit.question_asked",
                rule=PLANNER,
                reason=(
                    f"Asked the reporter a question to test the '{q.branch}' branch: "
                    "the answer is the reporter's own word, not evidence of the cause."
                ),
                refs=[],
                at=at,
                synthetic=synthetic,
            ),
        )
    return planned


async def pending_for_reporter(session: AsyncSession, reporter_ref: str) -> list[dict[str, Any]]:
    """Unanswered questions of every case that has a report of this reporter, oldest first."""
    case_ids = (
        select(case_sources.c.case_id)
        .where(case_sources.c.source_kind == "report", case_sources.c.reporter_ref == reporter_ref)
        .scalar_subquery()
    )
    steps = (
        (
            await session.execute(
                select(
                    audit_trail.c.case_id,
                    audit_trail.c.step,
                    audit_trail.c.content,
                    audit_trail.c.created_at,
                    cases.c.synthetic,
                )
                .join(cases, cases.c.id == audit_trail.c.case_id)
                .where(audit_trail.c.case_id.in_(case_ids), audit_trail.c.step.in_(("question", "answer")))
                .order_by(audit_trail.c.id)
            )
        )
        .mappings()
        .all()
    )
    answered = {s["content"]["question_id"] for s in steps if s["step"] == "answer"}
    return [
        {
            "question_id": s["content"]["question_id"],
            "case_id": s["case_id"],
            "text": s["content"]["text"],
            "asked_at": s["created_at"],
            "synthetic": s["synthetic"],
        }
        for s in steps
        if s["step"] == "question" and s["content"]["question_id"] not in answered
    ]


async def record_answer(
    session: AsyncSession,
    *,
    case_id: str,
    question: str,
    answer: str,
    choice: str | None,
    reporter_ref: str,
    at: datetime,
) -> dict[str, Any]:
    """Store the answer of the reporter to an open question of the case (one answer per question).

    Raises InterviewError("unknown") for a question that does not exist or is not this reporter's (the two look
    the same to the caller), InterviewError("answered") when it already has an answer."""
    reports = (
        await session.execute(
            select(case_sources.c.source_id).where(
                case_sources.c.case_id == case_id,
                case_sources.c.source_kind == "report",
                case_sources.c.reporter_ref == reporter_ref,
            )
        )
    ).all()
    steps = (
        (
            await session.execute(
                select(audit_trail.c.id, audit_trail.c.step, audit_trail.c.branch, audit_trail.c.content)
                .where(audit_trail.c.case_id == case_id, audit_trail.c.step.in_(("question", "answer")))
                .order_by(audit_trail.c.id)
                .with_for_update()
            )
        )
        .mappings()
        .all()
    )
    asked = next(
        (s for s in steps if s["step"] == "question" and s["content"]["question_id"] == question), None
    )
    if not reports or asked is None:
        raise InterviewError("unknown", "no such question for this reporter")
    if any(s["step"] == "answer" and s["content"]["question_id"] == question for s in steps):
        raise InterviewError("answered", "this question already has an answer")
    row = {
        "case_id": case_id,
        "step": "answer",
        "branch": asked["branch"],
        "content": {"question_id": question, "text": answer, "choice": choice},
        "status_label": "alleged",
        "evidence_refs": [f"question:{question}", *[f"report:{r.source_id}" for r in reports]],
        "actor": WITNESS,
        "created_at": at,
    }
    inserted = (
        await session.execute(audit_trail.insert().values(**row).returning(audit_trail.c.id))
    ).scalar_one()
    return {"id": inserted, **row}
