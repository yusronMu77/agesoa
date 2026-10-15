"""institution webhooks: institutions, case validations, webhook jobs, local secrets

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-16 03:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("audit_reports", sa.Column("category", sa.String(length=48), nullable=True))
    op.alter_column("subscriptions", "api_key_hash", existing_type=sa.String(length=64), nullable=True)
    op.create_table(
        "institutions",
        sa.Column("organization_id", sa.String(length=32), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("admin_ref", sa.String(length=128), nullable=True),
        sa.Column("api_key_hash", sa.String(length=64), nullable=True),
        sa.Column("api_key_prefix", sa.String(length=16), nullable=True),
        sa.Column("api_key_created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("synthetic", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("organization_id"),
        sa.UniqueConstraint("api_key_hash"),
    )
    op.create_table(
        "case_validations",
        sa.Column("case_id", sa.String(length=32), nullable=False),
        sa.Column("outcome", sa.String(length=16), nullable=False),
        sa.Column("labels", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("case_id"),
    )
    op.create_table(
        "webhook_jobs",
        sa.Column("delivery_id", sa.String(length=32), nullable=False),
        sa.Column("event_id", sa.String(length=64), nullable=False),
        sa.Column("event", sa.String(length=32), nullable=False),
        sa.Column("subscription_id", sa.String(length=32), nullable=False),
        sa.Column("organization_id", sa.String(length=32), nullable=False),
        sa.Column("case_id", sa.String(length=32), nullable=False),
        sa.Column("audit_report_id", sa.String(length=32), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="pending", nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("internal_ticket", sa.String(length=120), nullable=True),
        sa.Column("synthetic", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("delivery_id"),
        sa.UniqueConstraint("event_id"),
    )
    op.create_index("ix_webhook_jobs_org_case", "webhook_jobs", ["organization_id", "case_id"])
    op.create_table(
        "local_secrets",
        sa.Column("ref", sa.String(length=128), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("ref"),
    )


def downgrade() -> None:
    op.drop_table("local_secrets")
    op.drop_index("ix_webhook_jobs_org_case", table_name="webhook_jobs")
    op.drop_table("webhook_jobs")
    op.drop_table("case_validations")
    op.drop_table("institutions")
    op.alter_column("subscriptions", "api_key_hash", existing_type=sa.String(length=64), nullable=False)
    op.drop_column("audit_reports", "category")
