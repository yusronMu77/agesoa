"""Quorum rule (decision table of test case TC-111) and its boundaries."""

import pytest
from agesoa_trust.quorum import Vote, evaluate, evidence_requests, may_decide, state


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


# --- needs_evidence ("Butuh bukti"): recorded, never counted toward quorum ------------------------------


def test_asking_for_evidence_never_counts_toward_quorum():
    asks = [vote("v1", "ORG-A", "high", "needs_evidence"), vote("v2", "ORG-B", "medium", "needs_evidence")]
    assert evaluate(asks).outcome == "pending"
    # it neither blocks nor replaces an approval: two approvals from two parties still close the validation
    votes = [*asks, vote("v3", "ORG-C", "high"), vote("v4", None, "medium")]
    assert evaluate(votes).outcome == "approved"
    # and it is not a rejection
    assert evaluate([vote("v1", "ORG-A", "high"), vote("v2", "ORG-B", "high", "needs_evidence")]).outcome == (
        "pending"
    )


def test_open_validation_needs_evidence_while_a_counted_validator_asks_for_it():
    assert state([]) == "awaiting_decisions"
    assert state([vote("v1", "ORG-A", "high")]) == "awaiting_decisions"
    votes = [vote("v1", "ORG-A", "high"), vote("v2", "ORG-B", "medium", "needs_evidence")]
    assert (state(votes), evidence_requests(votes)) == ("needs_evidence", 1)


@pytest.mark.parametrize(
    "uncounted",
    [
        vote("v2", "ORG-B", "medium", "needs_evidence", conflict=True),
        vote("v2", "ORG-B", "medium", "needs_evidence", status="awaiting_confirmation"),
    ],
    ids=["declared-conflict", "inactive"],
)
def test_an_uncounted_evidence_request_does_not_change_the_state(uncounted):
    assert state([uncounted]) == "awaiting_decisions"
    assert evidence_requests([uncounted]) == 0


@pytest.mark.parametrize(
    ("previous", "decision", "allowed"),
    [
        (None, "approve", True),
        (None, "reject", True),
        (None, "needs_evidence", True),
        ("needs_evidence", "approve", True),  # replaces the request for evidence
        ("needs_evidence", "reject", True),
        ("needs_evidence", "needs_evidence", False),  # asked already
        ("approve", "reject", False),  # approve / reject are final
        ("approve", "needs_evidence", False),
        ("reject", "approve", False),
        ("reject", "needs_evidence", False),
    ],
)
def test_one_final_decision_per_validator(previous, decision, allowed):
    assert may_decide(previous, decision) is allowed
