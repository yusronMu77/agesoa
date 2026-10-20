"""organization contact email (private, for finding notifications)

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-20 09:10:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("contact_email", sa.String(length=254), nullable=True))


def downgrade() -> None:
    op.drop_column("organizations", "contact_email")
