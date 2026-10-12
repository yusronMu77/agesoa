"""Synthetic scenarios: fictional cases with a planted root cause and an answer key.

They live next to the pack (`<pack>/scenarios/<id>.json`), are served only behind demo_mode, and double as
agent eval items. Loading checks them against the pack, so a scenario can never drift from the rules it
claims to exercise (expected rule violations are recomputed by the engine).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from agesoa_contracts import ContractError, validate_scenario

from agesoa_packs.engine import evaluate_rules
from agesoa_packs.loader import DomainPack, PackError

SCENARIO_DIR = "scenarios"


@dataclass(frozen=True)
class Scenario:
    id: str
    pack: str
    document: dict[str, Any] = field(repr=False)

    @property
    def answer_key(self) -> dict[str, Any]:
        return self.document["answer_key"]

    def public_view(self) -> dict[str, Any]:
        """The scenario as demo data: everything except the answer key."""
        return {k: v for k, v in self.document.items() if k != "answer_key"}

    def summary(self) -> dict[str, Any]:
        doc = self.document
        return {
            "id": self.id,
            "pack": self.pack,
            "title": doc["title"],
            "region": doc["region"],
            "reports": len(doc["reports"]),
            "signals": len(doc["signals"]),
            "synthetic": True,
        }


def parse_scenario(document: dict[str, Any], pack: DomainPack, source: str = "<memory>") -> Scenario:
    try:
        validate_scenario(document, subject=f"scenario {source}")
    except ContractError as exc:
        raise PackError(source, exc.errors) from None
    errors = _cross_reference_errors(document, pack)
    if errors:
        raise PackError(source, errors)
    return Scenario(id=document["id"], pack=document["pack"], document=document)


def load_scenarios(pack: DomainPack) -> dict[str, Scenario]:
    """Load `<pack dir>/scenarios/*.json`; the id must match the file name. Empty when the pack has none."""
    if pack.path is None:
        return {}
    scenarios: dict[str, Scenario] = {}
    for file in sorted((pack.path / SCENARIO_DIR).glob("*.json")):
        source = str(file)
        try:
            document = json.loads(file.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise PackError(source, [f"not valid JSON: {exc}"]) from None
        scenario = parse_scenario(document, pack, source)
        if scenario.id != file.stem:
            raise PackError(
                source, [f"id: scenario id {scenario.id!r} must match its file name {file.stem!r}"]
            )
        scenarios[scenario.id] = scenario
    return scenarios


def _cross_reference_errors(doc: dict[str, Any], pack: DomainPack) -> list[str]:
    errors: list[str] = []
    if doc["pack"] != pack.id:
        errors.append(f"pack: scenario belongs to {doc['pack']!r}, loaded with pack {pack.id!r}")
        return errors

    refs = [r["ref"] for r in doc["reports"]] + [s["ref"] for s in doc["signals"]]
    errors += [f"ref {r!r} is used twice" for r in sorted({r for r in refs if refs.count(r) > 1})]

    fields = pack.fields
    violated: set[str] = set()
    for i, report in enumerate(doc["reports"]):
        if report["category"] not in pack.category_ids:
            errors.append(f"reports/{i}/category: unknown category {report['category']!r}")
        unknown = sorted(set(report["fields"]) - set(fields))
        errors += [f"reports/{i}/fields: unknown report field {f!r}" for f in unknown]
        try:
            results = evaluate_rules(pack, report["fields"])
        except ValueError as exc:
            errors.append(f"reports/{i}/fields: {exc}")
            continue
        violated |= {r.rule_id for r in results if r.violated}

    key = doc["answer_key"]
    branches = {b["id"] for b in pack.cause_branches}
    for path, cause in [("root_cause", key["root_cause"])] + [
        (f"contributing/{i}", c) for i, c in enumerate(key["contributing"])
    ]:
        if cause["branch"] not in branches:
            errors.append(f"answer_key/{path}/branch: unknown cause branch {cause['branch']!r}")

    rule_ids = {r["id"] for r in pack.rules}
    expected = set(key["expected_rule_violations"])
    errors += [
        f"answer_key/expected_rule_violations: unknown rule {r!r}" for r in sorted(expected - rule_ids)
    ]
    if not expected - rule_ids and expected != violated:
        errors.append(
            "answer_key/expected_rule_violations: "
            f"expected {sorted(expected)}, but the reports violate {sorted(violated)}"
        )
    return errors
