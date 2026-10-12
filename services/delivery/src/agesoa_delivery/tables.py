"""Tables owned by delivery (database `delivery`). Every change ships with an Alembic migration.
No other service reads these tables: other domains learn about changes through events."""

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Index,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB

metadata = MetaData()

audit_reports = Table(
    "audit_reports",
    metadata,
    Column("id", String(32), primary_key=True),
    Column("case_id", String(32), nullable=False, unique=True),
    Column("domain", String(48), nullable=False),
    Column("summary", Text, nullable=False),
    Column("root_causes", JSONB, nullable=False),
    Column("recommendations", JSONB, nullable=False, server_default="[]"),
    Column("region", JSONB),
    Column("synthetic", Boolean, nullable=False, server_default="false"),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
)

# Institution subscriptions. The HMAC secret lives in Secret Manager (secret_ref); API keys are stored hashed.
subscriptions = Table(
    "subscriptions",
    metadata,
    Column("id", String(32), primary_key=True),
    Column("organization_id", String(32), nullable=False),
    Column("region_code", String(32)),
    Column("category", String(48)),
    Column("webhook_url", Text, nullable=False),
    Column("secret_ref", Text, nullable=False),
    Column("api_key_hash", String(64), nullable=False, unique=True),
    Column("active", Boolean, nullable=False, server_default="true"),
    Column("synthetic", Boolean, nullable=False, server_default="false"),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
)

# Webhook delivery log: one row per attempt.
deliveries = Table(
    "deliveries",
    metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("delivery_id", String(32), nullable=False),
    Column("event_id", String(64), nullable=False),
    Column("case_id", String(32), nullable=False),
    Column("organization_id", String(32), nullable=False),
    Column("attempt", Integer, nullable=False),
    Column("http_status", Integer),
    Column("error", Text),
    Column("attempted_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Index("ix_deliveries_event", "event_id"),
)

follow_ups = Table(
    "follow_ups",
    metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("case_id", String(32), nullable=False),
    Column("organization_id", String(32), nullable=False),
    Column("status", String(16), nullable=False),  # received | in_progress | done
    Column("note", Text),
    Column("internal_ticket", String(120)),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Index("ix_follow_ups_case", "case_id"),
)

# Right of reply: shown next to the finding, labelled as the institution's statement.
replies = Table(
    "replies",
    metadata,
    Column("id", String(32), primary_key=True),
    Column("case_id", String(32), nullable=False),
    Column("organization_id", String(32), nullable=False),
    Column("body", Text, nullable=False),
    Column("attachments", JSONB, nullable=False, server_default="[]"),
    Column("received_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Index("ix_replies_case", "case_id"),
)
