"""Tables owned by case-audit (database `case_audit`). Every change ships with an Alembic migration.
No other service reads these tables: other domains learn about changes through events.
ADK sessions (witness interviews across days) are stored here too, in tables managed by ADK's
DatabaseSessionService."""

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    MetaData,
    String,
    Table,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB

metadata = MetaData()

cases = Table(
    "cases",
    metadata,
    Column("id", String(32), primary_key=True),
    Column("domain", String(48), nullable=False),
    Column("category", String(48), nullable=False),
    Column(
        "status", String(32), nullable=False
    ),  # open | investigating | awaiting_validation | final | closed
    Column("region", JSONB),
    Column("evidence_status", String(16), nullable=False),  # available | likely_lost | unknown
    Column("evidence_deadline_at", DateTime(timezone=True)),
    Column("max_finding_status", String(16), nullable=False),  # alleged | supported | proven
    Column("synthetic", Boolean, nullable=False, server_default="false"),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Column("updated_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    # When the earliest incident of the case happened: the reference for grouping new reports (cases.py).
    Column("occurred_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Index("ix_cases_matching", "domain", "category", "occurred_at"),
)

# Reports and signals grouped into a case (copied from events; never read from ingestion's database).
case_sources = Table(
    "case_sources",
    metadata,
    Column("case_id", String(32), ForeignKey("cases.id", ondelete="CASCADE"), primary_key=True),
    Column("source_kind", String(16), primary_key=True),  # report | signal
    Column("source_id", String(32), primary_key=True),
    Column("snapshot", JSONB, nullable=False),
    Column("linked_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
)

# Audit trail: every hypothesis, question, answer, pattern test and conclusion, with its evidence status.
audit_trail = Table(
    "audit_trail",
    metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("case_id", String(32), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False),
    Column("step", String(32), nullable=False),  # hypothesis | question | answer | pattern_test | conclusion
    Column("branch", String(48)),  # cause_framework branch id from the domain pack
    Column("content", JSONB, nullable=False),
    Column("status_label", String(16)),  # alleged | supported | proven
    Column("evidence_refs", JSONB, nullable=False, server_default="[]"),
    Column("actor", String(48), nullable=False),  # agent name or role, never a person's name
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Index("ix_audit_trail_case", "case_id", "id"),
)

findings = Table(
    "findings",
    metadata,
    Column("id", String(32), primary_key=True),
    Column("case_id", String(32), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False),
    Column("statement", Text, nullable=False),
    Column("status", String(16), nullable=False),  # alleged | supported | proven
    Column("validation", String(16), nullable=False),  # pending | approved | rejected
    Column("evidence_refs", JSONB, nullable=False, server_default="[]"),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Column("validated_at", DateTime(timezone=True)),
    Index("ix_findings_case", "case_id"),
)
