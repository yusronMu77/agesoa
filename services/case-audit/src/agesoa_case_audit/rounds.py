"""Runs the audit round of a case after the event that triggered it has committed (see `run_round_detached`).

Two things the event's transaction used to do by holding its locks for the whole round now live here, and neither holds
a transaction or a pooled connection while it waits:

- rounds of one case run one after the other, because they share the case's ADK session and replace each other's
  hypotheses (the regency lock of the handler did this before, as a side effect);
- at most `parallel` rounds wait on the model at once, so a burst of reports (the demo reset sends a dozen) does not
  ask Vertex AI for more than its quota.
"""

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime

from agesoa_packs import DomainPack
from agesoa_platform.db import Database

from agesoa_case_audit.agent import Ranker
from agesoa_case_audit.audit import run_round_detached
from agesoa_case_audit.patterns import IncidentStore

log = logging.getLogger(__name__)


class RoundRunner:
    def __init__(self, parallel: int = 4):
        self._model = asyncio.Semaphore(max(1, parallel))
        self._cases: dict[str, tuple[asyncio.Lock, int]] = {}  # lock and how many rounds hold or await it

    @asynccontextmanager
    async def _one_at_a_time(self, case_id: str) -> AsyncIterator[None]:
        lock, users = self._cases.get(case_id, (asyncio.Lock(), 0))
        self._cases[case_id] = (lock, users + 1)
        try:
            async with lock:
                yield
        finally:
            lock, users = self._cases[case_id]
            if users == 1:
                del self._cases[case_id]
            else:
                self._cases[case_id] = (lock, users - 1)

    async def run(
        self,
        db: Database,
        *,
        case_id: str,
        pack: DomainPack,
        store: IncidentStore,
        at: datetime,
        ranker: Ranker | None,
    ) -> None:
        """A failed round is logged, not raised: the event is already recorded, so a redelivery would be a duplicate,
        and the next source or answer of the case runs a new round from all of its sources."""
        try:
            async with self._one_at_a_time(case_id), self._model:
                await run_round_detached(db, case_id=case_id, pack=pack, store=store, at=at, ranker=ranker)
        except Exception:
            log.exception("audit round failed after the case was updated", extra={"case_id": case_id})
