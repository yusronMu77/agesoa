"""`demo_mode` gate: demo-only code paths (fictional data, scripted interviews, seeded validators) sit behind it."""

from __future__ import annotations

import asyncio

from fastapi import HTTPException, Request, status
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from agesoa_platform.db import Database

# Not owned by the service: the migration version and PostGIS's reference table.
RESET_KEEP_TABLES = ("alembic_version", "spatial_ref_sys")
RESET_ATTEMPTS = 3


def demo_mode_enabled(request: Request) -> bool:
    return bool(request.app.state.settings.demo_mode)


def require_demo_mode(request: Request) -> None:
    """FastAPI dependency: the route does not exist (404) unless demo_mode is on."""
    if not demo_mode_enabled(request):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not Found")


async def reset_tables(db: Database) -> list[str]:
    """Empty every table the service owns (data, outbox, inbox) and restart its identity columns.

    Demo environments only (callers sit behind `require_demo_mode`). Tables are found in the current
    schema, so a new table is covered without touching this function. The caller seeds again afterwards.
    """
    keep = ", ".join(f"'{name}'" for name in RESET_KEEP_TABLES)  # constants, not user input
    find = (
        "select tablename from pg_tables "  # noqa: S608
        f"where schemaname = current_schema() and tablename not in ({keep}) order by tablename"
    )
    # TRUNCATE takes an exclusive lock per table; background work of the running service (outbox flush, read
    # model sync, a scheduler sweep) may hold a share lock on another one, and Postgres then aborts one side
    # with "deadlock detected". The reset is all-or-nothing, so it is simply run again.
    for attempt in range(1, RESET_ATTEMPTS + 1):
        try:
            async with db.transaction() as session:
                names = list((await session.execute(text(find))).scalars().all())
                if names:
                    listed = ", ".join(f'"{name}"' for name in names)  # names come from pg_tables
                    await session.execute(text(f"truncate {listed} restart identity cascade"))
            return names
        except DBAPIError as exc:
            if attempt == RESET_ATTEMPTS or "deadlock detected" not in str(exc):
                raise
            await asyncio.sleep(0.2 * attempt)
    raise AssertionError("unreachable")
