"""stored projection sources use the English event type names (#150)

The read model is rebuilt from `read_model_events`, and the builders look rows up by event type. Rows stored before
the catalog names were made English kept the old names, so a rebuild (or any new event for an older document) produced
documents without their content. Rename them once; the mapping is one to one, so the downgrade restores the old names.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Old catalog name -> English name, only the types transparency keeps as projection source.
RENAMED = {
    "laporan.diterima": "report.received",
    "sinyal.diterima": "signal.received",
    "kasus.diperbarui": "case.updated",
    "temuan.siap_validasi": "finding.ready_for_validation",
    "validasi.selesai": "validation.completed",
    "laporan_audit.dibuat": "audit_report.created",
    "tindak_lanjut.diperbarui": "follow_up.updated",
    "hak_jawab.diterima": "right_of_reply.received",
    "wilayah.diperbarui": "region.updated",
}

_rename = sa.text("update read_model_events set event_type = :new where event_type = :old")


def upgrade() -> None:
    for old, new in RENAMED.items():
        op.execute(_rename.bindparams(old=old, new=new))


def downgrade() -> None:
    for old, new in RENAMED.items():
        op.execute(_rename.bindparams(old=new, new=old))
