"""Demo fallback (only with demo_mode): seed the fictional organizations and validators of
`services/trust/demo/validators.json` so a finding can reach quorum in a demo without the registration flow.
Idempotent; never runs when demo_mode is off (and demo_mode is refused in prod)."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from agesoa_platform.db import Database
from sqlalchemy.dialects.postgresql import insert

from agesoa_trust.identity import IdentityAdmin
from agesoa_trust.tables import organizations, staff_confirmations, validators

# <service>/demo, both in a checkout and in the image (/app keeps the repository layout).
DEMO_FILE = Path(__file__).resolve().parents[2] / "demo" / "validators.json"


async def seed_demo_accounts(admin: IdentityAdmin, password: str, path: Path = DEMO_FILE) -> int:
    """Sign-in accounts in the Firebase Auth emulator: demo validators (uid = validator auth_uid) and the
    demo organization admin."""
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
                await session.execute(insert(table).values(row).on_conflict_do_nothing())
    return len(data["validators"])
