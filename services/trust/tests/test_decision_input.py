"""Request rules that need no database: decision body and organization contact email."""

import pytest
from agesoa_trust.api import DecisionIn, _vote_reason
from agesoa_trust.organizations import OrganizationIn
from pydantic import ValidationError


@pytest.mark.parametrize("decision", ["approve", "reject", "needs_evidence"])
def test_three_decision_values(decision):
    assert DecisionIn(decision=decision, note="Lab result missing.").decision == decision


@pytest.mark.parametrize("note", ["", "   "])
def test_asking_for_evidence_says_what_is_missing(note):
    with pytest.raises(ValidationError, match="which evidence is missing"):
        DecisionIn(decision="needs_evidence", note=note)
    assert DecisionIn(decision="approve", note=note).note == note  # optional for approve/reject


def test_unknown_decision_is_rejected():
    with pytest.raises(ValidationError):
        DecisionIn(decision="abstain")


def test_decision_log_text_of_each_vote():
    assert _vote_reason("needs_evidence", True, False, "Lab result missing.") == (
        "Validator asked for more evidence before deciding (not counted toward quorum). Note: Lab result missing."
    )
    assert _vote_reason("needs_evidence", False, False, "x").startswith(
        "Validator asked for more evidence before deciding (not counted toward quorum; declared conflict"
    )
    assert _vote_reason("approve", True, True, "") == (
        "Validator approved the finding, replacing their request for more evidence."
    )
    assert _vote_reason("reject", False, False, "") == (
        "Validator rejected the finding (declared conflict of interest: recorded, not counted)."
    )


ORG = {"name": "Dinas Contoh (fictional)", "kind": "agency", "domain": "dinas.example.org"}
REGION = {"regency_name": "Kabupaten Sukamaju (fictional)"}


@pytest.mark.parametrize(
    ("given", "stored"),
    [
        (None, None),
        ("", None),  # an empty optional form field
        ("   ", None),
        (" Kontak@Dinas.Example.ORG ", "Kontak@dinas.example.org"),  # domain lowercased, local part kept
        ("humas+temuan@dinas.example.org", "humas+temuan@dinas.example.org"),
    ],
)
def test_contact_email_is_optional_and_normalized(given, stored):
    assert OrganizationIn(**ORG, region=REGION, contact_email=given).contact_email == stored


@pytest.mark.parametrize(
    "bad",
    [
        "kontak",
        "kontak@",
        "@dinas.example.org",
        "kontak@dinas",
        "a@b@dinas.example.org",
        "kon tak@dinas.example.org",
        "kontak..x@dinas.example.org",
        ".kontak@dinas.example.org",
        "kontak@dinas_contoh.example.org",
        "x" * 65 + "@dinas.example.org",
        "kontak@" + "a" * 250 + ".org",
    ],
)
def test_invalid_contact_email_is_rejected(bad):
    with pytest.raises(ValidationError):
        OrganizationIn(**ORG, region=REGION, contact_email=bad)
