"""Outbox + inbox against a real Postgres (isolated schema). Skipped unless TEST_DATABASE_URL is set."""

import json
import os
import uuid
from pathlib import Path

import pytest
from agesoa_platform.db import Database
from agesoa_platform.events import new_event
from agesoa_platform.inbox import process_once
from agesoa_platform.messaging_tables import inbox, metadata, outbox
from agesoa_platform.outbox import OutboxDispatcher, add_event
from agesoa_platform.settings import ServiceSettings
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine

URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="TEST_DATABASE_URL not set")
EXAMPLES = Path(__file__).resolve().parents[3] / "packages" / "contracts" / "events" / "examples"


class FakePublisher:
    def __init__(self, fail_first: int = 0):
        self.sent: list[dict] = []
        self.fail_first = fail_first

    async def publish(self, event):
        if self.fail_first:
            self.fail_first -= 1
            raise RuntimeError("pubsub down")
        self.sent.append(event)
        return str(len(self.sent))


@pytest.fixture
async def db():
    schema = f"pytest_{uuid.uuid4().hex[:8]}"
    admin = create_async_engine(URL)
    async with admin.begin() as conn:
        await conn.execute(text(f'create schema "{schema}"'))
    database = Database(ServiceSettings(service_name="trust", database_url=URL, db_search_path=schema))
    async with database.engine.begin() as conn:
        await conn.run_sync(metadata.create_all)
    yield database
    await database.dispose()
    async with admin.begin() as conn:
        await conn.execute(text(f'drop schema "{schema}" cascade'))
    await admin.dispose()


def decision():
    data = json.loads((EXAMPLES / "decision.recorded.json").read_text(encoding="utf-8"))["data"]
    return new_event("decision.recorded", source="trust", subject="F-1", data=data)


async def test_outbox_publishes_after_commit_and_retries_failures(db):
    publisher = FakePublisher(fail_first=1)
    dispatcher = OutboxDispatcher(db, publisher)
    event = decision()
    async with db.transaction() as session:
        await add_event(session, event)
    assert await dispatcher.pending() == 1
    assert await dispatcher.dispatch() == {"published": 0, "failed": 1}
    assert await dispatcher.dispatch() == {"published": 1, "failed": 0}
    assert publisher.sent == [event]
    assert await dispatcher.pending() == 0
    async with db.sessions() as session:
        row = (await session.execute(select(outbox.c.attempts, outbox.c.last_error))).one()
    assert row == (2, None)


async def test_rolled_back_unit_of_work_leaves_no_event(db):
    with pytest.raises(RuntimeError):
        async with db.transaction() as session:
            await add_event(session, decision())
            raise RuntimeError("business error")
    assert await OutboxDispatcher(db, FakePublisher()).pending() == 0


async def test_inbox_runs_handler_once_per_event_id(db):
    calls = []

    async def handler(session, event):
        calls.append(event["id"])

    event = decision()
    assert await process_once(db, event, handler) is True
    assert await process_once(db, event, handler) is False
    assert calls == [event["id"]]
    async with db.sessions() as session:
        assert (await session.execute(select(inbox.c.event_id))).scalars().all() == [event["id"]]


async def test_failed_handler_does_not_mark_event_processed(db):
    async def broken(session, event):
        raise RuntimeError("boom")

    event = decision()
    with pytest.raises(RuntimeError):
        await process_once(db, event, broken)

    async def ok(session, event):
        return None

    assert await process_once(db, event, ok) is True


async def test_operator_event_stats_count_types_without_payloads(db):
    from agesoa_platform.ops import event_stats

    dispatcher = OutboxDispatcher(db, FakePublisher(fail_first=1))
    async with db.transaction() as session:
        await add_event(session, decision())
        await add_event(session, decision())
    await dispatcher.dispatch()  # first publish fails, second succeeds
    received = decision()
    assert await process_once(db, received, _handler)

    stats = await event_stats(db, "trust")
    assert (stats.outbox_published, stats.outbox_pending, stats.outbox_failing, stats.inbox_processed) == (
        1,
        1,
        1,
        1,
    )
    assert {(t.direction, t.event_type, t.count) for t in stats.by_type} == {
        ("out", "agesoa.decision.recorded", 2),
        ("in", "agesoa.decision.recorded", 1),
    }
    assert sorted(r.status for r in stats.recent) == ["failing", "processed", "published"]
    assert "payload" not in stats.model_dump_json() and "decision_id" not in stats.model_dump_json()


async def _handler(session, event):
    return None


async def test_demo_reset_runs_again_after_a_deadlock(db, monkeypatch):
    from agesoa_platform import demo
    from sqlalchemy.exc import DBAPIError

    real = db.transaction
    calls = {"n": 0}

    def flaky_transaction():
        calls["n"] += 1
        if calls["n"] == 1:
            raise DBAPIError("truncate", {}, Exception("deadlock detected"))
        return real()

    monkeypatch.setattr(db, "transaction", flaky_transaction)
    names = await demo.reset_tables(db)
    assert calls["n"] == 2 and "outbox" in names and "inbox" in names


async def test_demo_reset_does_not_hide_other_database_errors(db, monkeypatch):
    from agesoa_platform import demo
    from sqlalchemy.exc import DBAPIError

    def broken():
        raise DBAPIError("truncate", {}, Exception("permission denied"))

    monkeypatch.setattr(db, "transaction", broken)
    with pytest.raises(DBAPIError, match="permission denied"):
        await demo.reset_tables(db)
