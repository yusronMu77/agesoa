"""Event handlers hold a pooled connection while they work; only part of the pool may be used that way."""

import asyncio
from contextlib import asynccontextmanager

from agesoa_platform.db import Database
from agesoa_platform.inbox import process_once
from agesoa_platform.settings import ServiceSettings


class FakeSession:
    async def scalar(self, _statement):
        return "recorded"


def database(**pool) -> Database:
    # The engine connects lazily, so no server is needed; the transaction is replaced by a fake below.
    db = Database(
        ServiceSettings(service_name="trust", database_url="postgresql+asyncpg://u:p@localhost/x", **pool)
    )

    @asynccontextmanager
    async def transaction():
        yield FakeSession()

    db.transaction = transaction  # type: ignore[method-assign]
    return db


async def run_events(db: Database, count: int) -> int:
    running = peak = 0

    async def handler(session, event):
        nonlocal running, peak
        running += 1
        peak = max(peak, running)
        await asyncio.sleep(0.01)
        running -= 1

    await asyncio.gather(*(process_once(db, {"id": f"e{i}", "type": "t"}, handler) for i in range(count)))
    return peak


async def test_handlers_leave_the_reserved_connections_free():
    # pool 2 + overflow 2, two kept back: at most two handlers hold a connection at once
    assert await run_events(database(), 8) == 2


async def test_a_larger_pool_runs_more_handlers():
    assert await run_events(database(db_pool_size=3, db_max_overflow=3), 8) == 4


async def test_at_least_one_handler_always_runs():
    assert await run_events(database(db_pool_size=1, db_max_overflow=0, db_reserved_connections=2), 3) == 1
