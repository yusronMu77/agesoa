"""Validation deadline (Tenggat): ready time + the domain pack's validation.decision_window_hours."""

from datetime import UTC, datetime, timedelta, timezone

import pytest
from agesoa_packs import parse_pack
from agesoa_packs.loader import load_packs
from agesoa_trust.deadline import deadline_sort_key, decision_window_hours, validation_deadline
from agesoa_trust.settings import REPO_DOMAIN_PACKS

PACKS = load_packs(REPO_DOMAIN_PACKS)


def pack_with(validation):
    document = {**PACKS["mbg"].document}
    document.pop("validation", None)
    if validation is not None:
        document["validation"] = validation
    return parse_pack(document)


def test_deadline_counts_the_pack_window_from_the_ready_time():
    pack = pack_with({"decision_window_hours": 72})
    assert validation_deadline(pack, "2026-10-14T03:15:00Z") == datetime(2026, 10, 17, 3, 15, tzinfo=UTC)


def test_deadline_is_returned_in_utc_whatever_the_offset():
    pack = pack_with({"decision_window_hours": 1})
    deadline = validation_deadline(pack, "2026-10-14T10:00:00+07:00")
    assert deadline == datetime(2026, 10, 14, 4, 0, tzinfo=UTC) and deadline.tzinfo == UTC


@pytest.mark.parametrize("validation", [None, {}], ids=["no-section", "no-window"])
def test_no_deadline_without_the_pack_setting(validation):
    pack = pack_with(validation)
    assert decision_window_hours(pack) is None
    assert validation_deadline(pack, "2026-10-14T03:15:00Z") is None


def test_unknown_domain_has_no_deadline():
    assert validation_deadline(None, "2026-10-14T03:15:00Z") is None


@pytest.mark.parametrize("ready_at", ["2026-10-14T03:15:00", datetime(2026, 10, 14, 3, 15)])
def test_naive_ready_time_is_rejected(ready_at):
    with pytest.raises(ValueError, match="no time zone offset"):
        validation_deadline(pack_with({"decision_window_hours": 72}), ready_at)
    with pytest.raises(ValueError, match="no time zone offset"):
        validation_deadline(pack_with(None), ready_at)  # also when the pack sets no window


def test_repo_packs_define_their_window_as_data():
    assert decision_window_hours(PACKS["mbg"]) == 72
    assert decision_window_hours(PACKS["general"]) == 120


def test_queue_order_is_nearest_deadline_first_and_no_deadline_last():
    t0 = datetime(2026, 10, 14, tzinfo=timezone(timedelta(hours=7)))
    rows = [
        {"finding_id": "none-old", "deadline_at": None, "received_at": t0},
        {"finding_id": "late", "deadline_at": t0 + timedelta(days=5), "received_at": t0},
        {"finding_id": "soon", "deadline_at": t0 + timedelta(days=1), "received_at": t0 + timedelta(hours=2)},
        {"finding_id": "soon-older", "deadline_at": t0 + timedelta(days=1), "received_at": t0},
        {"finding_id": "none-new", "deadline_at": None, "received_at": t0 + timedelta(hours=1)},
    ]
    assert [r["finding_id"] for r in sorted(rows, key=deadline_sort_key)] == [
        "soon-older",
        "soon",
        "late",
        "none-old",
        "none-new",
    ]
