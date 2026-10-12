"""outbox and inbox tables

Revision ID: 0001
Revises:
Create Date: 2026-10-12
"""

from collections.abc import Sequence

from alembic import op

from agesoa_platform.messaging_tables import create_messaging_tables, drop_messaging_tables

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    create_messaging_tables(op)


def downgrade() -> None:
    drop_messaging_tables(op)
