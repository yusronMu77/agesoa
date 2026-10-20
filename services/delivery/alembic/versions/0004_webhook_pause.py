"""webhook pause: subscriptions.paused_at/resumed_at, webhook_jobs.held_at

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-20 09:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("subscriptions", sa.Column("paused_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("subscriptions", sa.Column("resumed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("webhook_jobs", sa.Column("held_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_webhook_jobs_subscription_status", "webhook_jobs", ["subscription_id", "status"])


def downgrade() -> None:
    # Held jobs go back to pending (the old code has no `held` status); the next start resumes them.
    op.execute("update webhook_jobs set status = 'pending' where status = 'held'")
    op.drop_index("ix_webhook_jobs_subscription_status", table_name="webhook_jobs")
    op.drop_column("webhook_jobs", "held_at")
    op.drop_column("subscriptions", "resumed_at")
    op.drop_column("subscriptions", "paused_at")
