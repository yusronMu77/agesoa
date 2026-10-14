"""Routing rule (TC-110 step 1, #40 role + region routing) as a decision table."""

import pytest
from agesoa_trust.routing import routed

SUKAMAJU = {"regency_code": None, "regency_name": "Kabupaten Sukamaju", "district_name": "Cibening"}
OTHER = {"regency_code": None, "regency_name": "Kabupaten Lain", "district_name": None}
AGENCY = "Badan Gizi Kabupaten Sukamaju"


def validator(role="nutritionist", region=SUKAMAJU, org=None):
    return {"role": role, "region": region, "organization_name": org}


def finding(roles=("nutritionist", "journalist"), region=SUKAMAJU, parties=(AGENCY,)):
    return {"required_roles": list(roles), "region": region, "parties_mentioned": list(parties)}


@pytest.mark.parametrize(
    ("who", "what", "expected"),
    [
        (validator(), finding(), True),  # role asked, same regency, independent
        (validator(role="education_watchdog"), finding(), False),  # role not asked
        (validator(role="education_watchdog"), finding(roles=()), True),  # no roles asked = any role
        (validator(region=OTHER), finding(), False),  # other regency
        (validator(region=None), finding(), True),  # national validator
        (validator(), finding(region=None), True),  # finding without region
        (validator(org=AGENCY), finding(), False),  # audited party: never routed (TC-110)
        (validator(org="Redaksi Sukamaju"), finding(), True),  # another organization
        (validator(org=AGENCY), finding(parties=()), True),  # agency staff on a case not naming the agency
    ],
)
def test_routing_decision_table(who, what, expected):
    assert routed(who, what) is expected


def test_regency_codes_win_over_names():
    coded = {"regency_code": "32.99", "regency_name": "Kabupaten Sukamaju"}
    assert routed(validator(region=coded), finding(region={**coded, "regency_name": "renamed"})) is True
    assert routed(validator(region=coded), finding(region={**coded, "regency_code": "32.98"})) is False
    # code on one side only: fall back to the names
    assert routed(validator(region=coded), finding(region=SUKAMAJU)) is True
