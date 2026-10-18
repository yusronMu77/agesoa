"""Preserve reporter-defined text fields independently of domain extraction."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("reports", sa.Column("custom_fields", JSONB, nullable=False, server_default="[]"))


def downgrade() -> None:
    op.drop_column("reports", "custom_fields")
