"""Audit rounds run after the event's transaction: one at a time per case, a bounded number on the model at once,
and rounds of one case that queue up are merged into the newest."""

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
    assert not runner._cases and not runner._latest  # nothing is kept for a case without a round
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


async def run_burst(monkeypatch, cases: list[str], parallel: int = 4) -> list[tuple[str, int]]:
    """(case, `at`) of the rounds that really ran for a burst that arrives at once; `at` is the arrival number."""
    ran: list[tuple[str, int]] = []

    async def fake_round(db, *, case_id, at, **_):
        ran.append((case_id, at))
        await asyncio.sleep(0.01)

    monkeypatch.setattr(rounds, "run_round_detached", fake_round)
    runner = RoundRunner(parallel)
    await asyncio.gather(
        *(runner.run(None, case_id=c, pack=None, store=None, at=i, ranker=None) for i, c in enumerate(cases))  # type: ignore[arg-type]
    )
    assert not runner._cases and not runner._latest
    return ran


async def test_rounds_of_one_case_that_queue_up_run_only_for_the_newest(monkeypatch):
    # The first starts at once; the ones queued behind it are skipped except the last, which reads every source.
    ran = await run_burst(monkeypatch, ["CASE-1"] * 12)

    assert ran == [("CASE-1", 0), ("CASE-1", 11)]


async def test_rounds_of_different_cases_are_not_merged(monkeypatch):
    ran = await run_burst(monkeypatch, ["CASE-1", "CASE-2", "CASE-1", "CASE-3", "CASE-2", "CASE-1"])

    assert sorted(ran) == [("CASE-1", 0), ("CASE-1", 5), ("CASE-2", 1), ("CASE-2", 4), ("CASE-3", 3)]


async def test_a_round_asked_after_the_previous_one_finished_runs(monkeypatch):
    ran: list[int] = []

    async def fake_round(db, *, at, **_):
        ran.append(at)

    monkeypatch.setattr(rounds, "run_round_detached", fake_round)
    runner = RoundRunner(2)
    for i in range(3):
        await runner.run(None, case_id="CASE-1", pack=None, store=None, at=i, ranker=None)  # type: ignore[arg-type]

    assert ran == [0, 1, 2]


async def test_a_skipped_round_does_not_wait_for_the_model_slot(monkeypatch):
    # One model slot, held by another case: the skipped round of CASE-1 must finish while that slot is still busy.
    release = asyncio.Event()
    finished: list[int] = []

    async def fake_round(db, *, case_id, at, **_):
        if case_id == "CASE-2":
            await release.wait()
        else:
            finished.append(at)

    monkeypatch.setattr(rounds, "run_round_detached", fake_round)
    runner = RoundRunner(1)

    def go(case_id, at):
        return asyncio.create_task(
            runner.run(None, case_id=case_id, pack=None, store=None, at=at, ranker=None)  # type: ignore[arg-type]
        )

    busy = go("CASE-2", 0)
    first, second, third = go("CASE-1", 1), go("CASE-1", 2), go("CASE-1", 3)
    await asyncio.sleep(0.05)
    # CASE-1's first round waits for the slot (it was asked first and holds the case lock); once it runs, the second
    # is skipped without a slot, and only the third still needs one.
    assert not finished
    release.set()
    await asyncio.gather(busy, first, second, third)

    assert finished == [1, 3]
