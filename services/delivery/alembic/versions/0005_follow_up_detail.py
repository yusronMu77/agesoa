"""follow-up status detail: follow_ups.detail

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-20 09:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("follow_ups", sa.Column("detail", sa.String(length=160), nullable=True))


def downgrade() -> None:
    op.drop_column("follow_ups", "detail")
