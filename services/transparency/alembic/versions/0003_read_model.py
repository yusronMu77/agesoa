"""public read model: projection source + progress

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-13
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "read_model_events",
        sa.Column("id", sa.BigInteger, sa.Identity(), primary_key=True),
        sa.Column("event_id", sa.String(64), nullable=False, unique=True),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("doc_kind", sa.String(16), nullable=False),
        sa.Column("doc_id", sa.String(64), nullable=False),
        sa.Column("data", JSONB, nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("projected_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_read_model_events_doc", "read_model_events", ["doc_kind", "doc_id"])
    op.create_index(
        "ix_read_model_events_pending",
        "read_model_events",
        ["id"],
        postgresql_where=sa.text("projected_at is null"),
    )
    op.create_table(
        "read_model_state",
        sa.Column("key", sa.String(32), primary_key=True),
        sa.Column("value", sa.BigInteger, nullable=False),
    )


def downgrade() -> None:
    op.drop_table("read_model_state")
    op.drop_index("ix_read_model_events_pending", table_name="read_model_events")
    op.drop_index("ix_read_model_events_doc", table_name="read_model_events")
    op.drop_table("read_model_events")
