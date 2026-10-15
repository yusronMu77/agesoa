"""Validator registration decision table (TC-105, TC-107, TC-110 step 2, TC-123)."""

from datetime import date

import pytest
from agesoa_trust.registration import Organization, Outcome, Reading, after_confirmation, decide

TODAY = date(2026, 10, 16)
NEWSROOM = Organization("Redaksi Sukamaju (fictional)", "newsroom", "verified")
UNVERIFIED = Organization("Redaksi Sukamaju (fictional)", "newsroom", "awaiting_dns")
AGENCY = Organization("Badan Gizi Kabupaten Sukamaju (fictional)", "agency", "verified")


def reading(issuer="Redaksi Sukamaju (fictional)", valid=date(2027, 1, 1), confidence=0.9, kind="press_id"):
    return Reading(kind, issuer, valid, confidence)


@pytest.mark.parametrize(
    ("doc", "org", "expected"),
    [
        # 1. path 4 + confirmation by a verified newsroom: waits for confirmation, tier high afterwards
        (reading(), NEWSROOM, Outcome("awaiting_confirmation", "org_confirmed", None)),
        # 2. path 4 without organization, confidence above the threshold: medium, on probation
        (reading(issuer="Persatuan Ahli Gizi"), None, Outcome("probation", "self_declared", "medium")),
        # 3. without organization, confidence below the threshold: rejected
        (reading(confidence=0.4), None, Outcome("rejected", "self_declared", None, "low_confidence")),
        # 4. organization not verified: treated as no organization, never high
        (reading(), UNVERIFIED, Outcome("probation", "self_declared", "medium")),
        (reading(confidence=0.4), UNVERIFIED, Outcome("rejected", "self_declared", None, "low_confidence")),
        # TC-105: expired document, letterhead of another organization
        (reading(valid=date(2024, 12, 31)), NEWSROOM, Outcome("rejected", "org_confirmed", None, "expired")),
        (reading(valid=date(2024, 12, 31)), None, Outcome("rejected", "self_declared", None, "expired")),
        (
            reading(issuer="Warta Sukamaju (fictional)"),
            NEWSROOM,
            Outcome("rejected", "org_confirmed", None, "issuer_mismatch"),
        ),
        # TC-110 step 2: an agency never confirms validators (it may be the audited party)
        (reading(issuer=AGENCY.name), AGENCY, Outcome("rejected", "org_confirmed", None, "audited_party")),
        (reading(kind="unreadable"), None, Outcome("rejected", "self_declared", None, "unreadable")),
    ],
)
def test_registration_decision_table(doc, org, expected):
    assert decide(doc, org, threshold=0.6, today=TODAY) == expected


def test_threshold_boundary_and_documents_without_expiry():
    assert decide(reading(confidence=0.6, valid=None), None, 0.6, TODAY).status == "probation"
    assert decide(reading(confidence=0.5999, valid=None), None, 0.6, TODAY).status == "rejected"
    assert decide(reading(valid=TODAY), None, 0.6, TODAY).status == "probation"  # valid through today


def test_issuer_comparison_ignores_case_spacing_and_fictional_label():
    assert (
        decide(reading(issuer="  redaksi   SUKAMAJU "), NEWSROOM, 0.6, TODAY).status
        == "awaiting_confirmation"
    )


def test_confirmation_by_the_newsroom():
    assert after_confirmation(True) == Outcome("probation", "org_confirmed", "high")
    assert after_confirmation(False).status == "rejected"
