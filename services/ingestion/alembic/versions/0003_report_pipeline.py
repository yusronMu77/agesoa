"""report pipeline: districts (PostGIS), shared posts, intake draft, evidence size

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-13 09:00:00

PostGIS objects are schema-qualified (`public.`) so the migration also runs in isolated test schemas whose
search_path does not include `public`.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Present already on the local cluster (CloudNativePG) and allowed for cloudsqlsuperuser on Cloud SQL.
    op.execute("create extension if not exists postgis schema public")
    op.create_table(
        "districts",
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("regency_code", sa.String(length=32), nullable=False),
        sa.Column("regency_name", sa.Text(), nullable=False),
        sa.Column("synthetic", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("loaded_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("code"),
    )
    op.execute("alter table districts add column geom public.geometry(MultiPolygon, 4326) not null")
    op.execute("create index ix_districts_geom on districts using gist (geom)")

    op.create_table(
        "shared_posts",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("canonical_url", sa.Text(), nullable=False),
        sa.Column("platform", sa.String(length=32), nullable=False),
        sa.Column("excerpt", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("canonical_url"),
    )
    op.drop_column("reports", "shared_post_url")
    op.add_column("reports", sa.Column("shared_post_id", sa.String(length=32), nullable=True))
    op.create_foreign_key(
        "fk_reports_shared_post", "reports", "shared_posts", ["shared_post_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index("ix_reports_shared_post", "reports", ["shared_post_id"], unique=False)
    op.add_column("reports", sa.Column("intake", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("evidence", sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("evidence", "size_bytes")
    op.drop_column("reports", "intake")
    op.drop_index("ix_reports_shared_post", table_name="reports")
    op.drop_constraint("fk_reports_shared_post", "reports", type_="foreignkey")
    op.drop_column("reports", "shared_post_id")
    op.add_column("reports", sa.Column("shared_post_url", sa.Text(), nullable=True))
    op.drop_table("shared_posts")
    op.drop_index("ix_districts_geom", table_name="districts")
    op.drop_table("districts")
