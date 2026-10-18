"""Tables owned by ingestion (database `ingestion`). Every change ships with an Alembic migration.
No other service reads these tables: other domains learn about changes through events."""

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB

metadata = MetaData()

# Citizen reports. Anonymous: reporter_ref is the anonymous auth uid, never a name. Location is stored as
# administrative area codes/names only (region), never raw coordinates.
reports = Table(
    "reports",
    metadata,
    Column("id", String(32), primary_key=True),
    Column("status", String(16), nullable=False),  # draft | submitted | withdrawn
    Column("domain", String(48), nullable=False),
    Column("category", String(48)),
    Column("narrative", Text),
    Column("fields", JSONB, nullable=False, server_default="{}"),  # per the domain pack's report_fields
    Column("custom_fields", JSONB, nullable=False, server_default="[]"),  # reporter-defined text pairs
    Column("rule_results", JSONB, nullable=False, server_default="[]"),
    Column("region", JSONB),
    Column("shared_post_id", String(32), ForeignKey("shared_posts.id", ondelete="SET NULL")),
    # What Agen Intake proposed (category, fields, model), kept apart from the reporter-confirmed `fields`.
    Column("intake", JSONB),
    Column("reporter_ref", String(128), nullable=False),
    Column("synthetic", Boolean, nullable=False, server_default="false"),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Column("updated_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Column("submitted_at", DateTime(timezone=True)),
    Index("ix_reports_reporter", "reporter_ref"),
    Index("ix_reports_shared_post", "shared_post_id"),
)

# A social post shared by reporters, deduplicated on its canonical URL (reposts of the same post = one row).
# Only the link without the poster's username, the platform and a short excerpt; never profile data.
shared_posts = Table(
    "shared_posts",
    metadata,
    Column("id", String(32), primary_key=True),
    Column("canonical_url", Text, nullable=False, unique=True),
    Column("platform", String(32), nullable=False),
    Column("excerpt", Text),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
)

# Administrative boundaries for location -> district. The PostGIS column `geom` (MultiPolygon, 4326) is created by
# migration 0003 and only used through SQL in regions.py, so it is not declared here.
districts = Table(
    "districts",
    metadata,
    Column("code", String(32), primary_key=True),
    Column("name", Text, nullable=False),
    Column("regency_code", String(32), nullable=False),
    Column("regency_name", Text, nullable=False),
    Column("synthetic", Boolean, nullable=False, server_default="false"),
    Column("loaded_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
)

# Evidence files: stored in the media bucket after EXIF removal; only the hash and object path live here.
evidence = Table(
    "evidence",
    metadata,
    Column("id", String(32), primary_key=True),
    Column("report_id", String(32), ForeignKey("reports.id", ondelete="CASCADE"), nullable=False),
    Column("media_type", String(64), nullable=False),
    Column("sha256", String(64), nullable=False),
    Column("object_path", Text, nullable=False),
    Column("kind", String(16), nullable=False),  # photo | audio | screenshot
    Column("size_bytes", Integer, nullable=False, server_default="0"),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Index("ix_evidence_report", "report_id"),
)

# Public signals (news, official releases, shared social posts) extracted into incidents.
signals = Table(
    "signals",
    metadata,
    Column("id", String(32), primary_key=True),
    Column("domain", String(48), nullable=False),
    Column("category", String(48), nullable=False),
    Column("occurred_on", Date, nullable=False),
    Column("region", JSONB),
    Column("summary", Text, nullable=False),
    Column("sources", JSONB, nullable=False),
    Column("dedup_key", String(256), nullable=False, unique=True),
    Column("synthetic", Boolean, nullable=False, server_default="false"),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
)
