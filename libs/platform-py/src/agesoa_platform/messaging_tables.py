"""Outbox and inbox tables. Every service owns its own copy in its own database (created by its first migration)."""

from __future__ import annotations

from sqlalchemy import BigInteger, Column, DateTime, Index, Integer, MetaData, String, Table, Text, func
from sqlalchemy.dialects.postgresql import JSONB

metadata = MetaData()

outbox = Table(
    "outbox",
    metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("event_id", String(64), nullable=False, unique=True),
    Column("event_type", String(128), nullable=False),
    Column("payload", JSONB, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Column("published_at", DateTime(timezone=True)),
    Column("attempts", Integer, nullable=False, server_default="0"),
    Column("last_error", Text),
)
Index("ix_outbox_unpublished", outbox.c.id, postgresql_where=outbox.c.published_at.is_(None))

inbox = Table(
    "inbox",
    metadata,
    Column("event_id", String(64), primary_key=True),
    Column("event_type", String(128), nullable=False),
    Column("received_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
)


def create_messaging_tables(op) -> None:
    """Call from a service's first Alembic migration."""
    op.create_table(
        "outbox",
        Column("id", BigInteger, primary_key=True, autoincrement=True),
        Column("event_id", String(64), nullable=False, unique=True),
        Column("event_type", String(128), nullable=False),
        Column("payload", JSONB, nullable=False),
        Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
        Column("published_at", DateTime(timezone=True)),
        Column("attempts", Integer, nullable=False, server_default="0"),
        Column("last_error", Text),
    )
    op.create_index("ix_outbox_unpublished", "outbox", ["id"], postgresql_where="published_at IS NULL")
    op.create_table(
        "inbox",
        Column("event_id", String(64), primary_key=True),
        Column("event_type", String(128), nullable=False),
        Column("received_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    )


def drop_messaging_tables(op) -> None:
    op.drop_table("inbox")
    op.drop_index("ix_outbox_unpublished", table_name="outbox")
    op.drop_table("outbox")
