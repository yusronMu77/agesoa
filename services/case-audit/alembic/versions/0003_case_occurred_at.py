"""case occurred_at: when the earliest incident of the case happened (reference for grouping)

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-15 18:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "cases",
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_cases_matching", "cases", ["domain", "category", "occurred_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_cases_matching", table_name="cases")
    op.drop_column("cases", "occurred_at")
