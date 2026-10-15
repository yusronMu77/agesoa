"""validator registration outcome (rejection reason, decision time)

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-16 01:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("validators", sa.Column("rejection_reason", sa.String(length=32), nullable=True))
    op.add_column("validators", sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("validators", "decided_at")
    op.drop_column("validators", "rejection_reason")
