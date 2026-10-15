"""`demo_mode` gate: demo-only code paths (fictional data, scripted interviews, seeded validators) sit behind it."""

from __future__ import annotations

from fastapi import HTTPException, Request, status
from sqlalchemy import text

from agesoa_platform.db import Database

# Not owned by the service: the migration version and PostGIS's reference table.
RESET_KEEP_TABLES = ("alembic_version", "spatial_ref_sys")


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
    async with db.transaction() as session:
        names = list((await session.execute(text(find))).scalars().all())
        if names:
            listed = ", ".join(f'"{name}"' for name in names)  # names come from pg_tables
            await session.execute(text(f"truncate {listed} restart identity cascade"))
    return names
