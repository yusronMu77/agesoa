"""Audit rounds run after the event's transaction: one at a time per case, a bounded number on the model at once."""

import asyncio
import logging

from agesoa_case_audit import rounds
from agesoa_case_audit.rounds import RoundRunner


async def run_rounds(monkeypatch, cases: list[str], parallel: int) -> tuple[int, int]:
    """Peak of rounds running for one case, and peak of rounds running overall."""
    per_case: dict[str, int] = {}
    peak_case = peak_all = 0

    async def fake_round(db, *, case_id, **_):
        nonlocal peak_case, peak_all
        per_case[case_id] = per_case.get(case_id, 0) + 1
        peak_case = max(peak_case, per_case[case_id])
        peak_all = max(peak_all, sum(per_case.values()))
        await asyncio.sleep(0.01)
        per_case[case_id] -= 1

    monkeypatch.setattr(rounds, "run_round_detached", fake_round)
    runner = RoundRunner(parallel)
    await asyncio.gather(
        *(runner.run(None, case_id=c, pack=None, store=None, at=None, ranker=None) for c in cases)  # type: ignore[arg-type]
    )
    assert not runner._cases  # no lock is kept for a case without a round
    return peak_case, peak_all


async def test_rounds_of_one_case_run_one_after_the_other(monkeypatch):
    peak_case, peak_all = await run_rounds(monkeypatch, ["CASE-1"] * 5, parallel=4)
    assert (peak_case, peak_all) == (1, 1)


async def test_rounds_of_different_cases_overlap_up_to_the_limit(monkeypatch):
    peak_case, peak_all = await run_rounds(monkeypatch, [f"CASE-{i}" for i in range(10)], parallel=3)
    assert (peak_case, peak_all) == (1, 3)


async def test_a_failed_round_is_logged_and_does_not_stop_the_next(monkeypatch, caplog):
    calls: list[str] = []

    async def fake_round(db, *, case_id, **_):
        calls.append(case_id)
        if case_id == "CASE-1":
            raise RuntimeError("database went away")

    monkeypatch.setattr(rounds, "run_round_detached", fake_round)
    runner = RoundRunner(2)
    with caplog.at_level(logging.ERROR):
        for case_id in ("CASE-1", "CASE-2"):
            await runner.run(None, case_id=case_id, pack=None, store=None, at=None, ranker=None)  # type: ignore[arg-type]
    assert calls == ["CASE-1", "CASE-2"]
    assert "audit round failed after the case was updated" in caplog.text
