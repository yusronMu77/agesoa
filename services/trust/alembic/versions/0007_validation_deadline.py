"""validation request decision deadline (domain pack validation.decision_window_hours)

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-20 09:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Requests opened before this migration keep no deadline (null): none was promised when they opened.
    op.add_column("validation_requests", sa.Column("deadline_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("validation_requests", "deadline_at")
