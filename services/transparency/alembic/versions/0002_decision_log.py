"""hash-chained decision log

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

GENESIS_HASH = "0" * 64


def upgrade() -> None:
    op.create_table(
        "decision_log",
        sa.Column("seq", sa.BigInteger, primary_key=True, autoincrement=False),
        sa.Column("event_id", sa.String(64), nullable=False, unique=True),
        sa.Column("decision_id", sa.String(64), nullable=False),
        sa.Column("source_service", sa.String(32), nullable=False),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("subject_kind", sa.String(32), nullable=False),
        sa.Column("subject_id", sa.String(64), nullable=False),
        sa.Column("entry", JSONB, nullable=False),
        sa.Column("prev_hash", sa.String(64), nullable=False),
        sa.Column("hash", sa.String(64), nullable=False, unique=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_decision_log_subject", "decision_log", ["subject_kind", "subject_id"])
    chain_head = op.create_table(
        "chain_head",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=False),
        sa.Column("seq", sa.BigInteger, nullable=False),
        sa.Column("hash", sa.String(64), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.bulk_insert(chain_head, [{"id": 1, "seq": 0, "hash": GENESIS_HASH}])
    # The log is append-only: refuse UPDATE and DELETE at the database level too.
    op.execute(
        """
        create function decision_log_append_only() returns trigger language plpgsql as $$
        begin
          raise exception 'decision_log is append-only';
        end $$;
        """
    )
    op.execute(
        "create trigger decision_log_no_change before update or delete on decision_log "
        "for each row execute function decision_log_append_only()"
    )


def downgrade() -> None:
    op.execute("drop trigger if exists decision_log_no_change on decision_log")
    op.execute("drop function if exists decision_log_append_only()")
    op.drop_table("chain_head")
    op.drop_index("ix_decision_log_subject", table_name="decision_log")
    op.drop_table("decision_log")
