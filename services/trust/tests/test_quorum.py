"""Quorum rule (decision table of test case TC-111) and its boundaries."""

import pytest
from agesoa_trust.quorum import Vote, evaluate


def vote(vid, org, tier, decision="approve", status="active", conflict=False):
    return Vote(vid, org, tier, status, decision, conflict)


@pytest.mark.parametrize(
    ("votes", "outcome"),
    [
        # (a) 2 approvals, different organizations, at least one high tier -> final
        ([vote("v1", "ORG-A", "high"), vote("v2", "ORG-B", "medium")], "approved"),
        # (b) 2 approvals from the same organization -> not final
        ([vote("v1", "ORG-A", "high"), vote("v2", "ORG-A", "high")], "pending"),
        # (c) 2 approvals, different organizations, no high tier -> not final
        ([vote("v1", "ORG-A", "medium"), vote("v2", "ORG-B", "medium")], "pending"),
        # (d) 1 approval + 1 rejection -> back to the audit as an allegation
        ([vote("v1", "ORG-A", "high"), vote("v2", "ORG-B", "medium", "reject")], "rejected"),
        # (e) 1 high-tier organization validator + 1 independent -> final
        ([vote("v1", "ORG-A", "high"), vote("v2", None, "medium")], "approved"),
    ],
    ids=["a-final", "b-same-org", "c-no-high", "d-reject", "e-independent"],
)
def test_decision_table(votes, outcome):
    assert evaluate(votes).outcome == outcome


def test_one_approval_is_never_enough():
    assert evaluate([vote("v1", "ORG-A", "high")]).outcome == "pending"
    assert evaluate([]).outcome == "pending"


def test_two_independent_validators_are_two_parties():
    assert evaluate([vote("v1", None, "high"), vote("v2", None, "medium")]).outcome == "approved"


def test_declared_conflict_is_not_counted():
    votes = [vote("v1", "ORG-A", "high"), vote("v2", "ORG-B", "medium", conflict=True)]
    assert evaluate(votes).outcome == "pending"
    # a rejection with a declared conflict does not block either
    votes = [vote("v1", "ORG-A", "high"), vote("v2", "ORG-B", "medium", "reject", conflict=True)]
    assert evaluate(votes).outcome == "pending"


@pytest.mark.parametrize("status", ["awaiting_confirmation", "rejected"])
def test_inactive_validators_are_not_counted(status):
    votes = [vote("v1", "ORG-A", "high"), vote("v2", "ORG-B", "medium", status=status)]
    assert evaluate(votes).outcome == "pending"


def test_probation_validators_count():
    votes = [vote("v1", "ORG-A", "high"), vote("v2", "ORG-B", "medium", status="probation")]
    assert evaluate(votes).outcome == "approved"


def test_pending_reason_names_what_is_missing():
    reason = evaluate([vote("v1", "ORG-A", "medium")]).reason
    assert "2 different organizations" in reason and "high-tier" in reason
