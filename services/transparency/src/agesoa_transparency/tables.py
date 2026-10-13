"""Tables owned by transparency (database `transparency`). Every change ships with an Alembic migration.
No other service reads these tables: other domains learn about changes through events."""

from sqlalchemy import BigInteger, Column, DateTime, Identity, MetaData, String, Table, func
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

# Private copy of every public-facing event this service consumes: the source the Firestore read model is
# projected from, so the read model can always be rebuilt (it is never the source of truth).
read_model_events = Table(
    "read_model_events",
    metadata,
    Column("id", BigInteger, Identity(), primary_key=True),
    Column("event_id", String(64), nullable=False, unique=True),
    Column("event_type", String(64), nullable=False),
    Column("doc_kind", String(16), nullable=False),  # case | finding | signal | report
    Column("doc_id", String(64), nullable=False),
    Column("data", JSONB, nullable=False),
    Column("occurred_at", DateTime(timezone=True), nullable=False),
    Column("received_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Column("projected_at", DateTime(timezone=True)),
)

# Projection progress that has no row of its own (e.g. the last decision_log seq copied to the read model).
read_model_state = Table(
    "read_model_state",
    metadata,
    Column("key", String(32), primary_key=True),
    Column("value", BigInteger, nullable=False),
)
