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
    Column("category", String(48)),  # domain-pack category; matched against subscriptions
    Column("synthetic", Boolean, nullable=False, server_default="false"),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
)

# Verified organizations, learned from `organisasi.terverifikasi` (trust owns them). admin_ref = uid of the
# organization's admin account; only the hash of the institution API key is stored.
institutions = Table(
    "institutions",
    metadata,
    Column("organization_id", String(32), primary_key=True),
    Column("name", Text, nullable=False),
    Column("kind", String(16), nullable=False),  # newsroom | agency
    Column("admin_ref", String(128)),
    Column("api_key_hash", String(64), unique=True),
    Column("api_key_prefix", String(16)),
    Column("api_key_created_at", DateTime(timezone=True)),
    Column("synthetic", Boolean, nullable=False, server_default="false"),
    Column("verified_at", DateTime(timezone=True), nullable=False),
)

# Validation of a case's finding (from `validasi.selesai`): public labels only (role + regency, never names).
case_validations = Table(
    "case_validations",
    metadata,
    Column("case_id", String(32), primary_key=True),
    Column("outcome", String(16), nullable=False),
    Column("labels", JSONB, nullable=False, server_default="[]"),
    Column("completed_at", DateTime(timezone=True), nullable=False),
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
    Column("api_key_hash", String(64), unique=True),  # unused: the API key belongs to the institution
    Column("active", Boolean, nullable=False, server_default="true"),
    Column("synthetic", Boolean, nullable=False, server_default="false"),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
)

# One webhook to send (an audit report or a test event to one subscription): the signed body and its state.
# Retries reuse the same event id; `attempts` guards against a task that runs twice.
webhook_jobs = Table(
    "webhook_jobs",
    metadata,
    Column("delivery_id", String(32), primary_key=True),
    Column("event_id", String(64), nullable=False, unique=True),
    Column("event", String(32), nullable=False),  # audit_report.final | test_event
    Column("subscription_id", String(32), nullable=False),
    Column("organization_id", String(32), nullable=False),
    Column("case_id", String(32), nullable=False),
    Column("audit_report_id", String(32)),
    Column("body", Text, nullable=False),
    Column("status", String(16), nullable=False, server_default="pending"),  # pending | delivered | failed
    Column("attempts", Integer, nullable=False, server_default="0"),
    Column("internal_ticket", String(120)),
    Column("synthetic", Boolean, nullable=False, server_default="false"),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Column("finished_at", DateTime(timezone=True)),
    Index("ix_webhook_jobs_org_case", "organization_id", "case_id"),
)

# Webhook secrets in the devenv only (no Secret Manager locally); elsewhere secret_ref names a Secret Manager secret.
local_secrets = Table(
    "local_secrets",
    metadata,
    Column("ref", String(128), primary_key=True),
    Column("value", Text, nullable=False),
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
