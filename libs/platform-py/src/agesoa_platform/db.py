"""Async SQLAlchemy engine + sessions. Each service connects only to its own database."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from agesoa_platform.settings import ServiceSettings


class Database:
    def __init__(self, settings: ServiceSettings):
        connect_args = (
            {"server_settings": {"search_path": settings.db_search_path}} if settings.db_search_path else {}
        )
        self.engine: AsyncEngine = create_async_engine(
            settings.database_url,
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            pool_pre_ping=True,
            pool_recycle=1800,
            connect_args=connect_args,
        )
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)

    @asynccontextmanager
    async def transaction(self) -> AsyncIterator[AsyncSession]:
        """One unit of work: commit on success, roll back on error."""
        async with self.sessions() as session, session.begin():
            yield session

    async def check(self) -> dict[str, object]:
        """Readiness probe: proves the connection works and names the database it reached."""
        async with self.engine.connect() as conn:
            row = (await conn.execute(text("select current_database(), current_user"))).one()
        return {"ok": True, "name": row[0], "user": row[1]}

    async def dispose(self) -> None:
        await self.engine.dispose()


def sync_url(url: str) -> str:
    """Alembic runs with psycopg (sync); services use asyncpg. Same URL otherwise."""
    return url.replace("postgresql+asyncpg://", "postgresql+psycopg://", 1)
