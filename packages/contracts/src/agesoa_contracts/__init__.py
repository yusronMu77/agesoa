"""Contracts shared by the services: event catalog + CloudEvents schemas, webhook and domain-pack schemas.

The JSON files under packages/contracts are the source of truth; this module only loads and validates
against them. The package is installed editable (uv workspace, also inside the service images), so the
files are read from the repository layout.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import ValidationError
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parents[2]
EVENTS_DIR = ROOT / "events"
WEBHOOK_DIR = ROOT / "webhook"
DOMAIN_PACK_SCHEMA = ROOT / "domain-pack" / "domain-pack.schema.json"
SCENARIO_SCHEMA = ROOT / "domain-pack" / "scenario.schema.json"

SERVICES = ("ingestion", "case-audit", "trust", "delivery", "transparency")
TYPE_PREFIX = "agesoa."


class ContractError(ValueError):
    """A document does not match its contract. `errors` lists every problem as 'path: message'."""

    def __init__(self, subject: str, errors: list[str]):
        self.subject = subject
        self.errors = errors
        super().__init__(f"{subject} is invalid:\n" + "\n".join(f"  - {e}" for e in errors))


@dataclass(frozen=True)
class EventSpec:
    type: str  # catalog name, e.g. "laporan.diterima"
    schema_file: str
    producer: str  # service name, or "*" for any service
    consumers: tuple[str, ...]
    description: str

    @property
    def ce_type(self) -> str:
        return TYPE_PREFIX + self.type

    @property
    def dataschema(self) -> str:
        version = self.schema_file.rsplit(".v", 1)[1].split(".", 1)[0]
        return f"urn:agesoa:schema:event:{self.type}:v{version}"


def _read(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


@cache
def catalog() -> dict[str, EventSpec]:
    data = _read(EVENTS_DIR / "catalog.json")
    return {
        e["type"]: EventSpec(e["type"], e["schema"], e["producer"], tuple(e["consumers"]), e["description"])
        for e in data["events"]
    }


@cache
def _registry() -> Registry:
    resources = []
    for path in [
        *EVENTS_DIR.glob("*.schema.json"),
        *WEBHOOK_DIR.glob("*.schema.json"),
        DOMAIN_PACK_SCHEMA,
        SCENARIO_SCHEMA,
    ]:
        schema = _read(path)
        resources.append((schema["$id"], Resource.from_contents(schema)))
    return Registry().with_resources(resources)


@cache
def _validator(schema_id: str) -> Draft202012Validator:
    schema = _registry().contents(schema_id)
    return Draft202012Validator(schema, registry=_registry(), format_checker=FormatChecker())


def _check(schema_id: str, document: Any, subject: str) -> None:
    errors = sorted(_validator(schema_id).iter_errors(document), key=lambda e: list(e.absolute_path))
    if errors:
        raise ContractError(subject, [_describe(e) for e in errors])


def _describe(error: ValidationError) -> str:
    path = "/".join(str(p) for p in error.absolute_path) or "(root)"
    return f"{path}: {error.message}"


def event_spec(event_type: str) -> EventSpec:
    """Look up a catalog entry by catalog name ("laporan.diterima") or CloudEvents type ("agesoa.laporan.diterima")."""
    name = event_type.removeprefix(TYPE_PREFIX)
    try:
        return catalog()[name]
    except KeyError:
        raise ContractError(
            event_type, [f"unknown event type (not in events/catalog.json): {event_type}"]
        ) from None


def validate_event(event: dict[str, Any]) -> EventSpec:
    """Validate a structured CloudEvent against the schema named by its type. Returns the catalog entry."""
    spec = event_spec(str(event.get("type", "")))
    if event.get("dataschema") != spec.dataschema:
        raise ContractError(
            spec.type, [f"dataschema: expected {spec.dataschema}, got {event.get('dataschema')!r}"]
        )
    _check(spec.dataschema, event, f"event {spec.type}")
    return spec


def validate_webhook_body(body: dict[str, Any]) -> None:
    _check("urn:agesoa:schema:webhook:audit_report.final:v1", body, "webhook body")


def validate_domain_pack(document: dict[str, Any], subject: str = "domain pack") -> None:
    _check("urn:agesoa:schema:domain-pack:v1", document, subject)


def validate_scenario(document: dict[str, Any], subject: str = "scenario") -> None:
    _check("urn:agesoa:schema:scenario:v1", document, subject)


def all_schema_ids() -> list[str]:
    return sorted(str(uri) for uri in _registry())
