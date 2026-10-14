"""Which open findings a validator is routed to (business rule as code, see tests/test_routing.py).

A finding reaches a validator only when
- the validator's role is one of the roles the finding asks for (no roles asked = any role),
- the validator works in the finding's regency (validators without a region work everywhere), and
- the validator's organization is not named in the finding: the audited party never validates its own case.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any


def _regency(region: Mapping[str, Any] | None) -> tuple[str, str] | None:
    if not region:
        return None
    if region.get("regency_code"):
        return ("code", region["regency_code"])
    if region.get("regency_name"):
        return ("name", region["regency_name"])
    return None


def same_regency(
    validator_region: Mapping[str, Any] | None, finding_region: Mapping[str, Any] | None
) -> bool:
    mine, theirs = _regency(validator_region), _regency(finding_region)
    if mine is None or theirs is None:
        return True
    if mine[0] != theirs[0]:
        # One side has a code, the other only a name: compare names when both have one.
        a, b = (validator_region or {}).get("regency_name"), (finding_region or {}).get("regency_name")
        return a is None or b is None or a == b
    return mine[1] == theirs[1]


def conflicted(organization_name: str | None, parties_mentioned: list[str]) -> bool:
    return bool(organization_name) and organization_name in parties_mentioned


def routed(validator: Mapping[str, Any], finding: Mapping[str, Any]) -> bool:
    """`validator`: role, region, organization_name. `finding`: required_roles, region, parties_mentioned."""
    roles = finding.get("required_roles") or []
    if roles and validator["role"] not in roles:
        return False
    if not same_regency(validator.get("region"), finding.get("region")):
        return False
    return not conflicted(validator.get("organization_name"), finding.get("parties_mentioned") or [])
