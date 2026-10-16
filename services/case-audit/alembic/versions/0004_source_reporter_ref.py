"""case_sources.reporter_ref: the pseudonymous reporter of a report, so audit questions reach them

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-16 10:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("case_sources", sa.Column("reporter_ref", sa.String(length=40), nullable=True))
    op.create_index("ix_case_sources_reporter", "case_sources", ["reporter_ref"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_case_sources_reporter", table_name="case_sources")
    op.drop_column("case_sources", "reporter_ref")
