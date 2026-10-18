"""Demo reset (only with demo_mode): the log restarts from its genesis head and its first entry says so.

The log is append-only everywhere else. In a demo environment the data is synthetic, so a reset may start the
chain again, but it never does so silently: entry 1 records the reset, in the same public log.
"""

from __future__ import annotations

from agesoa_platform.events import isoformat, new_event, utc_now
from agesoa_platform.hashing import GENESIS_HASH
from fastapi import FastAPI

from agesoa_transparency import SERVICE
from agesoa_transparency.events import record_decision
from agesoa_transparency.tables import chain_head


async def restart_log(app: FastAPI) -> None:
    """After the tables were emptied: put the genesis head back and append the reset entry."""
    environment = app.state.settings.environment
    now = utc_now()
    decision_id = f"DEMO-RESET-{now:%Y%m%d%H%M%S%f}"
    event = new_event(
        "decision.recorded",
        source=SERVICE,
        subject=decision_id,
        data={
            "decision_id": decision_id,
            "actor": {"kind": "system", "name": "demo-reset", "service": SERVICE},
            "action": "demo.reset",
            "subject": {"kind": "environment", "id": environment},
            "reason": "The demo environment was reset: all demo data was removed and the synthetic data seeded again.",
            "evidence_refs": [],
            "status_label": None,
            "occurred_at": isoformat(now),
            "synthetic": True,
        },
    )
    async with app.state.db.transaction() as session:
        await session.execute(chain_head.insert().values(id=1, seq=0, hash=GENESIS_HASH))
        await record_decision(session, event)
