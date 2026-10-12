"""Shared Alembic `env.py` body: sync psycopg connection, one advisory lock so concurrent container starts never
migrate twice, and the database URL from DATABASE_URL."""

from __future__ import annotations

import os

from alembic import context
from sqlalchemy import create_engine, pool, text

from agesoa_platform.db import sync_url

# Arbitrary constant shared by every service; each service has its own database, so locks never collide.
MIGRATION_LOCK_ID = 727_001


def run_migrations(target_metadata=None) -> None:
    url = context.config.get_main_option("sqlalchemy.url") or os.environ["DATABASE_URL"]
    url = sync_url(url)
    search_path = os.environ.get("DB_SEARCH_PATH")
    if context.is_offline_mode():
        context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
        with context.begin_transaction():
            context.run_migrations()
        return
    connect_args = {"options": f"-c search_path={search_path}"} if search_path else {}
    engine = create_engine(url, poolclass=pool.NullPool, connect_args=connect_args)
    with engine.connect() as connection:
        # Session-level lock: survives the commit below and is held until the explicit unlock.
        connection.execute(text("select pg_advisory_lock(:id)"), {"id": MIGRATION_LOCK_ID})
        connection.commit()
        try:
            context.configure(connection=connection, target_metadata=target_metadata)
            with context.begin_transaction():
                context.run_migrations()
        finally:
            connection.execute(text("select pg_advisory_unlock(:id)"), {"id": MIGRATION_LOCK_ID})
            connection.commit()
    engine.dispose()
