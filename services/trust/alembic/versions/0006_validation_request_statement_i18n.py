"""validation request statement per language (temuan.siap_validasi statement_i18n)

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-18 09:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "validation_requests",
        sa.Column("statement_i18n", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("validation_requests", "statement_i18n")
