"""An audit round holds no transaction while the model answers (against a real Postgres, TEST_DATABASE_URL; skipped
otherwise). Before, the event's transaction stayed open for the whole round and blocked the demo reset's TRUNCATE."""

import asyncio
import json
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
from agesoa_case_audit.agent import LexicalRanker, RankResult
from agesoa_case_audit.audit import run_round_detached
from agesoa_case_audit.events import build_handlers
from agesoa_case_audit.main import build_app
from agesoa_case_audit.settings import Settings
from agesoa_case_audit.tables import audit_trail, case_sources
from agesoa_platform.demo import reset_tables
from agesoa_platform.events import new_event
from agesoa_platform.inbox import process_once
from agesoa_platform.testing import TEST_DATABASE_URL, RecordingPublisher, isolated_schema, push_envelope
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text

pytestmark = pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL not set")
ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"
EXAMPLES = Path(__file__).resolve().parents[3] / "packages" / "contracts" / "events" / "examples"
NOW = "2026-10-14T03:15:00Z"


@pytest.fixture
async def client():
    async with isolated_schema(alembic_ini=ALEMBIC_INI) as schema:
        settings = Settings(
            database_url=TEST_DATABASE_URL, db_search_path=schema, environment="test", demo_mode=True
        )
        app = build_app(settings)
        with TestClient(app) as c:
            app.state.outbox.publisher = RecordingPublisher()
            yield c


def report_event() -> dict:
    data = json.loads((EXAMPLES / "report.received.json").read_text(encoding="utf-8"))["data"]
    data = {**data, "report_id": "R-1", "received_at": NOW}
    return {**new_event("report.received", source="ingestion", subject="R-1", data=data), "time": NOW}


def open_a_case(client) -> str:
    response = client.post("/events/report.received", json=push_envelope(report_event()))
    assert response.status_code == 204, response.text
    return client.portal.call(first_case_id, client.app.state.db)


async def first_case_id(db) -> str:
    async with db.sessions() as session:
        return (await session.execute(text("select id from cases"))).scalar_one()


def count_open_transactions(db) -> dict[str, int]:
    state = {"open": 0}
    original = db.transaction

    @asynccontextmanager
    async def counted():
        async with original() as session:
            state["open"] += 1
            try:
                yield session
            finally:
                state["open"] -= 1

    db.transaction = counted
    return state


class Spy(LexicalRanker):
    """Lexical ranking that notes how many transactions are open when the model would be called, and can add a
    source to the case at that moment."""

    def __init__(self, db, state, *, join_a_source=False):
        self.db, self.state, self.join_a_source = db, state, join_a_source
        self.open_when_asked: list[int] = []

    async def rank(self, pack, sources, violated, *, case_id=None) -> RankResult:
        self.open_when_asked.append(self.state["open"])
        if self.join_a_source:
            async with self.db.transaction() as session:
                await session.execute(
                    text(
                        "insert into case_sources (case_id, source_kind, source_id, snapshot) "
                        "select case_id, 'report', 'R-2', snapshot from case_sources where case_id = cast(:case_id as varchar) limit 1"
                    ),
                    {"case_id": case_id},
                )
        result = await super().rank(pack, sources, violated, case_id=case_id)
        return RankResult(result.ranks, "spy", result.reasoning)


def run(client, case_id, ranker):
    app = client.app
    case_domain = client.portal.call(domain_of, app.state.db, case_id)
    client.portal.call(
        _round,
        app.state.db,
        case_id,
        app.state.packs[case_domain],
        app.state.incident_store,
        ranker,
    )


async def domain_of(db, case_id) -> str:
    async with db.sessions() as session:
        return (
            await session.execute(text("select domain from cases where id = :id"), {"id": case_id})
        ).scalar_one()


async def _round(db, case_id, pack, store, ranker):
    from datetime import UTC, datetime

    await run_round_detached(
        db,
        case_id=case_id,
        pack=pack,
        store=store,
        at=datetime(2026, 10, 14, 3, 20, tzinfo=UTC),
        ranker=ranker,
    )


async def hypothesis_methods(db, case_id) -> set[str]:
    async with db.sessions() as session:
        rows = (
            await session.execute(
                select(audit_trail.c.content["method"].astext).where(
                    audit_trail.c.case_id == case_id, audit_trail.c.step == "hypothesis"
                )
            )
        ).all()
    return {r[0] for r in rows}


def test_no_transaction_is_open_while_the_model_answers(client):
    case_id = open_a_case(client)
    db = client.app.state.db
    state = count_open_transactions(db)
    spy = Spy(db, state)

    run(client, case_id, spy)

    assert spy.open_when_asked == [0]
    assert state["open"] == 0
    assert client.portal.call(hypothesis_methods, db, case_id) == {"spy"}  # and the result was written


def test_a_round_drops_its_result_when_a_source_joined_the_case_meanwhile(client):
    case_id = open_a_case(client)
    db = client.app.state.db
    before = client.portal.call(hypothesis_methods, db, case_id)
    spy = Spy(db, count_open_transactions(db), join_a_source=True)

    run(client, case_id, spy)

    # the round that source starts writes the up to date result; this one must not overwrite it with an older one
    assert client.portal.call(hypothesis_methods, db, case_id) == before

    async def sources(db):
        async with db.sessions() as session:
            return (await session.execute(select(func.count()).select_from(case_sources))).scalar_one()

    assert client.portal.call(sources, db) == 2


def test_the_event_handler_leaves_the_round_for_after_the_commit(client):
    db, app = client.app.state.db, client.app
    state = count_open_transactions(db)
    spy = Spy(db, state)
    handlers = build_handlers(app.state.packs, app.state.incident_store, spy)

    assert client.portal.call(process_once, db, report_event(), handlers["report.received"]) is True

    assert spy.open_when_asked == [0]  # the case and its source were committed before the model was asked
    case_id = client.portal.call(first_case_id, db)
    assert client.portal.call(hypothesis_methods, db, case_id) == {"spy"}


class ResetWhileAsked(Spy):
    """The demo reset arrives while the model is being asked."""

    reset_done = False

    async def rank(self, pack, sources, violated, *, case_id=None) -> RankResult:
        await asyncio.wait_for(
            reset_tables(self.db), timeout=5
        )  # blocked forever by an open transaction before
        self.reset_done = True
        return await super().rank(pack, sources, violated, case_id=case_id)


def test_the_demo_reset_is_not_blocked_by_a_round_waiting_on_the_model(client):
    case_id = open_a_case(client)
    db = client.app.state.db
    spy = ResetWhileAsked(db, count_open_transactions(db))

    run(client, case_id, spy)

    assert spy.reset_done
    # the reset emptied the case, so the round finds its sources gone and writes nothing
    assert client.portal.call(hypothesis_methods, db, case_id) == set()
