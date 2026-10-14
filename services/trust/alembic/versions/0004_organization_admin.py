"""organization admin account (who registered it)

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-14 15:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("admin_uid", sa.String(length=128), nullable=True))
    op.create_index(op.f("ix_organizations_admin_uid"), "organizations", ["admin_uid"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_organizations_admin_uid"), table_name="organizations")
    op.drop_column("organizations", "admin_uid")
