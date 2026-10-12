"""Tables owned by transparency (database `transparency`). Every change ships with an Alembic migration.
No other service reads these tables: other domains learn about changes through events."""

from sqlalchemy import BigInteger, Column, DateTime, MetaData, String, Table, func
from sqlalchemy.dialects.postgresql import JSONB

metadata = MetaData()

# Append-only, hash-chained public decision log. This service is its only writer.
decision_log = Table(
    "decision_log",
    metadata,
    Column("seq", BigInteger, primary_key=True, autoincrement=False),
    Column("event_id", String(64), nullable=False, unique=True),
    Column("decision_id", String(64), nullable=False),
    Column("source_service", String(32), nullable=False),
    Column("action", String(64), nullable=False),
    Column("subject_kind", String(32), nullable=False),
    Column("subject_id", String(64), nullable=False),
    Column("entry", JSONB, nullable=False),  # exactly what was hashed
    Column("prev_hash", String(64), nullable=False),
    Column("hash", String(64), nullable=False, unique=True),
    Column("recorded_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
)

# Single row (id = 1) holding the chain tip; locked FOR UPDATE on every append so entries never fork.
chain_head = Table(
    "chain_head",
    metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=False),
    Column("seq", BigInteger, nullable=False),
    Column("hash", String(64), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
)
