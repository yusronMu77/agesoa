"""Demo fallback (only with demo_mode): seed the fictional organizations and validators of
`services/trust/demo/validators.json` so a finding can reach quorum in a demo without the registration flow.
Idempotent; never runs when demo_mode is off (and demo_mode is refused in prod)."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import Any

from agesoa_platform.db import Database
from agesoa_platform.events import isoformat, new_event, utc_now
from agesoa_platform.outbox import add_event
from sqlalchemy.dialects.postgresql import insert

from agesoa_trust import SERVICE
from agesoa_trust.identity import IdentityAdmin
from agesoa_trust.tables import organizations, staff_confirmations, validators

# <service>/demo, both in a checkout and in the image (/app keeps the repository layout).
DEMO_FILE = Path(__file__).resolve().parents[2] / "demo" / "validators.json"


async def seed_demo_accounts(admin: IdentityAdmin, password: str, path: Path = DEMO_FILE) -> int:
    """Sign-in accounts (Firebase Auth emulator or Identity Platform): demo validators (uid = validator auth_uid),
    the demo organization admin and the demo operator."""
    data = json.loads(await asyncio.to_thread(path.read_text, encoding="utf-8"))
    uids = {v["id"]: v["auth_uid"] for v in data["validators"]}
    for account in data["accounts"]:
        if "validator_id" in account:
            uid, roles = uids[account["validator_id"]], {"validator"}
        else:  # e.g. the demo organization admin (role org_admin)
            uid, roles = account["auth_uid"], set(account["roles"])
        await admin.ensure_account(uid, account["email"], password, roles)
    return len(data["accounts"])


async def seed_demo_validators(db: Database, path: Path = DEMO_FILE) -> int:
    data = json.loads(await asyncio.to_thread(path.read_text, encoding="utf-8"))
    async with db.transaction() as session:
        for table, key in (
            (organizations, "organizations"),
            (validators, "validators"),
            (staff_confirmations, "staff_confirmations"),
        ):
            for row in data[key]:
                stmt = insert(table).values(row)
                if table is organizations and row.get("admin_uid"):
                    # Seeds added later (the demo newsroom's admin) reach databases seeded before them.
                    stmt = stmt.on_conflict_do_update(
                        index_elements=[organizations.c.id],
                        set_={"admin_uid": row["admin_uid"]},
                        where=organizations.c.admin_uid.is_(None),
                    )
                else:
                    stmt = stmt.on_conflict_do_nothing()
                if table is organizations:
                    changed = (
                        (await session.execute(stmt.returning(*organizations.c))).mappings().one_or_none()
                    )
                    if changed is not None and changed["status"] == "verified":
                        # Other domains (delivery: institution webhooks) learn the seeded organizations like
                        # verified ones; only when inserted or given its admin, so a restart sends nothing.
                        await add_event(session, seeded_organization(changed, utc_now()))
                else:
                    await session.execute(stmt)
    return len(data["validators"])


def seeded_organization(row: Any, now: datetime) -> dict[str, Any]:
    return new_event(
        "organization.verified",
        source=SERVICE,
        subject=row["id"],
        data={
            "organization_id": row["id"],
            "name": row["name"],
            "kind": row["kind"],
            "domain": row["domain"],
            "method": "seed",
            "verified_at": isoformat(now),
            "synthetic": row["synthetic"],
            "admin_ref": row["admin_uid"],
        },
    )
