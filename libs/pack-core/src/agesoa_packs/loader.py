from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from agesoa_contracts import ContractError, validate_domain_pack

PACK_FILE = "pack.json"


class PackError(ValueError):
    def __init__(self, source: str, errors: list[str]):
        self.source = source
        self.errors = errors
        super().__init__(f"domain pack {source} is invalid:\n" + "\n".join(f"  - {e}" for e in errors))


@dataclass(frozen=True)
class DomainPack:
    id: str
    version: str
    document: dict[str, Any] = field(repr=False)
    path: Path | None = None

    @property
    def fields(self) -> dict[str, dict[str, Any]]:
        return {f["id"]: f for f in self.document["report_fields"]}

    @property
    def category_ids(self) -> list[str]:
        return [c["id"] for c in self.document["categories"]]

    @property
    def rules(self) -> list[dict[str, Any]]:
        return self.document["rules"]

    @property
    def evidence_deadline(self) -> dict[str, Any] | None:
        return self.document["evidence_deadline"]

    @property
    def validator_role_ids(self) -> list[str]:
        return [r["id"] for r in self.document["validator_roles"]]

    @property
    def cause_branches(self) -> list[dict[str, Any]]:
        return self.document["cause_framework"]["branches"]

    @property
    def pattern_metrics(self) -> dict[str, dict[str, Any]]:
        return {m["id"]: m for m in self.document.get("pattern_metrics", [])}

    def required_field_ids(self) -> list[str]:
        return [f["id"] for f in self.document["report_fields"] if f["required"]]

    def summary(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "version": self.version,
            "name": self.document["name"],
            "categories": self.category_ids,
            "rules": [r["id"] for r in self.rules],
        }


def parse_pack(document: dict[str, Any], source: str = "<memory>") -> DomainPack:
    """Validate a pack document (schema + cross references) and wrap it."""
    try:
        validate_domain_pack(document, subject=f"domain pack {source}")
    except ContractError as exc:
        raise PackError(source, exc.errors) from None
    errors = _cross_reference_errors(document)
    if errors:
        raise PackError(source, errors)
    return DomainPack(id=document["id"], version=document["version"], document=document)


def load_pack(path: str | Path) -> DomainPack:
    """Load `<dir>/pack.json` (or a pack.json path). The pack id must match its folder name."""
    path = Path(path)
    file = path / PACK_FILE if path.is_dir() else path
    source = str(file)
    try:
        document = json.loads(file.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise PackError(source, ["file not found"]) from None
    except json.JSONDecodeError as exc:
        raise PackError(source, [f"not valid JSON: {exc}"]) from None
    pack = parse_pack(document, source)
    folder = file.parent.name
    if pack.id != folder:
        raise PackError(source, [f"id: pack id {pack.id!r} must match its folder name {folder!r}"])
    return DomainPack(id=pack.id, version=pack.version, document=document, path=file.parent)


def load_packs(root: str | Path) -> dict[str, DomainPack]:
    """Load every `<root>/<id>/pack.json`. Any invalid pack fails the whole load (fail fast at startup)."""
    packs = [load_pack(d) for d in sorted(Path(root).iterdir()) if (d / PACK_FILE).is_file()]
    if not packs:
        raise PackError(str(root), ["no domain pack found (expected <root>/<id>/pack.json)"])
    return {p.id: p for p in packs}


def _duplicates(ids: list[str]) -> list[str]:
    seen: set[str] = set()
    dups: set[str] = set()
    for i in ids:
        (dups if i in seen else seen).add(i)
    return sorted(dups)


def _cross_reference_errors(doc: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for section in ("categories", "report_fields", "rules", "validator_roles", "pattern_metrics"):
        errors += [
            f"{section}: duplicate id {d!r}"
            for d in _duplicates([item["id"] for item in doc.get(section, [])])
        ]
    branch_ids = [b["id"] for b in doc["cause_framework"]["branches"]]
    errors += [f"cause_framework/branches: duplicate id {d!r}" for d in _duplicates(branch_ids)]

    fields = {f["id"]: f for f in doc["report_fields"]}

    def need(path: str, field_id: str | None, types: tuple[str, ...]) -> None:
        if field_id is None:
            return
        if field_id not in fields:
            errors.append(f"{path}: unknown report field {field_id!r}")
        elif fields[field_id]["type"] not in types:
            kind = fields[field_id]["type"]
            errors.append(f"{path}: field {field_id!r} must be of type {' or '.join(types)}, not {kind!r}")

    for i, rule in enumerate(doc["rules"]):
        if rule.get("supports_branch") is not None and rule["supports_branch"] not in branch_ids:
            errors.append(f"rules/{i}/supports_branch: unknown cause branch {rule['supports_branch']!r}")
        if rule["kind"] == "max_interval":
            need(f"rules/{i}/params/from_field", rule["params"]["from_field"], ("datetime",))
            need(f"rules/{i}/params/to_field", rule["params"]["to_field"], ("datetime",))

    rule_ids = {r["id"] for r in doc["rules"]}
    metric_ids = {m["id"] for m in doc.get("pattern_metrics", [])}
    for i, metric in enumerate(doc.get("pattern_metrics", [])):
        p, params = f"pattern_metrics/{i}/params", metric["params"]
        need(f"{p}/group_by", params["group_by"], ("string",))
        if metric["kind"] == "count_by":
            need(f"{p}/distinct", params.get("distinct"), ("string", "date", "datetime", "integer"))
        elif metric["kind"] == "sum_by":
            need(f"{p}/field", params["field"], ("integer",))
        elif metric["kind"] == "interval_minutes":
            need(f"{p}/from_field", params["from_field"], ("datetime",))
            need(f"{p}/to_field", params["to_field"], ("datetime",))
        elif metric["kind"] == "violations_by" and params["rule"] not in rule_ids:
            errors.append(f"{p}/rule: unknown rule {params['rule']!r}")
    for i, branch in enumerate(doc["cause_framework"]["branches"]):
        errors += [
            f"cause_framework/branches/{i}/pattern_metrics: unknown metric {m!r}"
            for m in branch.get("pattern_metrics", [])
            if m not in metric_ids
        ]

    deadline = doc["evidence_deadline"]
    if deadline is not None:
        need("evidence_deadline/anchor_field", deadline["anchor_field"], ("datetime",))
        need(
            "evidence_deadline/fallback_anchor_field",
            deadline.get("fallback_anchor_field"),
            ("date", "datetime"),
        )

    hints = doc.get("intake_hints", {})
    categories = {c["id"] for c in doc["categories"]}
    errors += [
        f"intake_hints/categories: unknown category {c!r}"
        for c in hints.get("categories", {})
        if c not in categories
    ]
    hint_types = {
        "pattern": ("string",),
        "time_after": ("datetime",),
        "number_before": ("integer",),
        "vocabulary": ("string_list",),
    }
    for field_id, hint in hints.get("fields", {}).items():
        for kind in hint:
            need(f"intake_hints/fields/{field_id}/{kind}", field_id, hint_types[kind])
        if "pattern" in hint:
            try:
                re.compile(hint["pattern"])
            except re.error as exc:
                errors.append(f"intake_hints/fields/{field_id}/pattern: invalid regular expression ({exc})")

    ladder = [step["status"] for step in doc["evidence_ladder"]]
    if ladder != ["proven", "supported", "alleged"]:
        errors.append(f"evidence_ladder: statuses must be ordered proven, supported, alleged (got {ladder})")
    return errors
