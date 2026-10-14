"""Tables owned by trust (database `trust`). Every change ships with an Alembic migration.
No other service reads these tables: other domains learn about changes through events."""

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    MetaData,
    String,
    Table,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB

metadata = MetaData()

organizations = Table(
    "organizations",
    metadata,
    Column("id", String(32), primary_key=True),
    Column("name", String(200), nullable=False),
    Column("kind", String(16), nullable=False),  # newsroom | agency
    Column("domain", String(253), nullable=False, unique=True),
    Column("status", String(24), nullable=False),  # awaiting_dns | verified | rejected
    Column("verification_token", String(64), nullable=False),
    Column("region", JSONB),
    Column("synthetic", Boolean, nullable=False, server_default="false"),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Column("verified_at", DateTime(timezone=True)),
    Column(
        "admin_uid", String(128), index=True
    ),  # account that registered it (role org_admin); null for seeds
)

# Validators: extracted document fields only; document images are deleted after the Role agent reads them.
validators = Table(
    "validators",
    metadata,
    Column("id", String(32), primary_key=True),
    Column("auth_uid", String(128), nullable=False, unique=True),
    Column("role", String(48), nullable=False),  # domain pack validator_roles id
    Column("field", String(120)),
    Column("region", JSONB),
    Column("organization_id", String(32), ForeignKey("organizations.id")),
    Column("path", String(24), nullable=False),  # self_declared | org_confirmed
    Column("tier", String(16)),  # high | medium
    Column("status", String(24), nullable=False),  # awaiting_confirmation | probation | active | rejected
    Column("extracted", JSONB, nullable=False, server_default="{}"),
    Column("confidence", Float),
    Column("valid_until", DateTime(timezone=True)),
    Column("synthetic", Boolean, nullable=False, server_default="false"),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
)

staff_confirmations = Table(
    "staff_confirmations",
    metadata,
    Column("validator_id", String(32), ForeignKey("validators.id", ondelete="CASCADE"), primary_key=True),
    Column("organization_id", String(32), ForeignKey("organizations.id"), primary_key=True),
    Column("status", String(16), nullable=False),  # pending | confirmed | rejected
    Column("decided_at", DateTime(timezone=True)),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
)

# A finding waiting for human validation (copied from temuan.siap_validasi).
validation_requests = Table(
    "validation_requests",
    metadata,
    Column("finding_id", String(32), primary_key=True),
    Column("case_id", String(32), nullable=False),
    Column("domain", String(48), nullable=False),
    Column("statement", Text, nullable=False),
    Column("status_label", String(16), nullable=False),
    Column("required_roles", JSONB, nullable=False, server_default="[]"),
    Column("parties_mentioned", JSONB, nullable=False, server_default="[]"),
    Column("evidence_refs", JSONB, nullable=False, server_default="[]"),
    Column("region", JSONB),  # finding region (regency + district names/codes); used for routing
    Column("outcome", String(16)),  # null while open | approved | rejected
    Column("synthetic", Boolean, nullable=False, server_default="false"),
    Column("received_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Column("completed_at", DateTime(timezone=True)),
)

validation_decisions = Table(
    "validation_decisions",
    metadata,
    Column(
        "finding_id",
        String(32),
        ForeignKey("validation_requests.finding_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("validator_id", String(32), ForeignKey("validators.id"), nullable=False),
    Column("decision", String(16), nullable=False),  # approve | reject
    Column("note", Text),
    Column("confidence", Float),
    Column("conflict", Boolean, nullable=False, server_default="false"),
    Column("decided_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    UniqueConstraint("finding_id", "validator_id", name="uq_validation_decision_once"),
    Index("ix_validation_decisions_finding", "finding_id"),
)
