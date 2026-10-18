"""Hash-chained decision log: rules as code.

entry_n = {seq, event_id, source, type, decision (the event data), recorded_at}
hash_n  = SHA-256(hash_{n-1} + "." + canonical_json(entry_n)), hash_0 = 64 zeros.

Appends serialize on the chain_head row, so the chain never forks even with several instances.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from agesoa_platform.events import isoformat, utc_now
from agesoa_platform.hashing import GENESIS_HASH, chain_hash
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from agesoa_transparency.tables import chain_head, decision_log


@dataclass(frozen=True)
class Appended:
    seq: int
    hash: str


async def append_decision(session: AsyncSession, event: dict[str, Any]) -> Appended:
    """Append a `decision.recorded` event. Call inside the inbox transaction (once per event id)."""
    head = (
        await session.execute(
            select(chain_head.c.seq, chain_head.c.hash).where(chain_head.c.id == 1).with_for_update()
        )
    ).one()
    data = event["data"]
    seq = head.seq + 1
    entry = {
        "seq": seq,
        "event_id": event["id"],
        "source": event["source"],
        "type": event["type"],
        "decision": data,
        "recorded_at": isoformat(utc_now()),
    }
    digest = chain_hash(head.hash, entry)
    await session.execute(
        decision_log.insert().values(
            seq=seq,
            event_id=event["id"],
            decision_id=data["decision_id"],
            source_service=data["actor"]["service"],
            action=data["action"],
            subject_kind=data["subject"]["kind"],
            subject_id=data["subject"]["id"],
            entry=entry,
            prev_hash=head.hash,
            hash=digest,
        )
    )
    await session.execute(
        update(chain_head).where(chain_head.c.id == 1).values(seq=seq, hash=digest, updated_at=utc_now())
    )
    return Appended(seq, digest)


@dataclass(frozen=True)
class Verification:
    ok: bool
    length: int
    head_hash: str
    first_invalid_seq: int | None = None
    reason: str | None = None


async def verify_chain(session: AsyncSession, batch: int = 1000) -> Verification:
    """Recompute every hash from the genesis and compare with the stored values and the head."""
    prev, expected_seq, last_seq = GENESIS_HASH, 1, 0
    while True:
        rows = (
            await session.execute(
                select(
                    decision_log.c.seq, decision_log.c.entry, decision_log.c.prev_hash, decision_log.c.hash
                )
                .where(decision_log.c.seq > last_seq)
                .order_by(decision_log.c.seq)
                .limit(batch)
            )
        ).all()
        for row in rows:
            if row.seq != expected_seq or row.entry.get("seq") != row.seq:
                return Verification(False, row.seq - 1, prev, row.seq, "sequence gap")
            if row.prev_hash != prev:
                return Verification(
                    False, row.seq - 1, prev, row.seq, "prev_hash does not match the previous entry"
                )
            if chain_hash(prev, row.entry) != row.hash:
                return Verification(False, row.seq - 1, prev, row.seq, "hash does not match the entry")
            prev, expected_seq, last_seq = row.hash, row.seq + 1, row.seq
        if len(rows) < batch:
            break
    head = (
        await session.execute(select(chain_head.c.seq, chain_head.c.hash).where(chain_head.c.id == 1))
    ).one()
    if (head.seq, head.hash) != (last_seq, prev):
        return Verification(False, last_seq, prev, last_seq + 1, "chain head does not match the last entry")
    return Verification(True, last_seq, prev)
