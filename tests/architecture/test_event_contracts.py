"""Architecture Fitness Test: Event Contracts.

Ensures every event in packages/contracts/events/catalog.json has a valid JSON Schema
and a valid example event file that passes schema validation, and that no orphan schemas exist.
"""

import json
import pathlib

import agesoa_contracts
from jsonschema import Draft202012Validator

WORKSPACE_ROOT = pathlib.Path(__file__).resolve().parents[2]


def test_event_contracts_catalog_schemas_examples_and_no_orphans():
    events_dir = WORKSPACE_ROOT / "packages" / "contracts" / "events"
    catalog_path = events_dir / "catalog.json"
    violations = []

    if not catalog_path.exists():
        rel_catalog = catalog_path.relative_to(WORKSPACE_ROOT)
        violations.append(f"File: {rel_catalog} - Rule violated: Event catalog file missing")
        assert not violations

    with open(catalog_path, encoding="utf-8") as f:
        catalog_data = json.load(f)

    catalog_schemas = set()
    examples_dir = events_dir / "examples"

    for event_spec in catalog_data.get("events", []):
        event_type = event_spec.get("type")
        schema_file_name = event_spec.get("schema")
        catalog_schemas.add(schema_file_name)

        schema_path = events_dir / schema_file_name
        rel_schema = schema_path.relative_to(WORKSPACE_ROOT)
        if not schema_path.exists():
            violations.append(
                f"File: {rel_schema} - Rule violated: Schema file for event '{event_type}' does not exist"
            )
            continue

        try:
            schema_contents = json.loads(schema_path.read_text(encoding="utf-8"))
            Draft202012Validator.check_schema(schema_contents)
        except Exception as e:
            violations.append(
                f"File: {rel_schema} - Rule violated: Invalid JSON schema for event '{event_type}': {e}"
            )
            continue

        example_path = examples_dir / f"{event_type}.json"
        rel_example = example_path.relative_to(WORKSPACE_ROOT)
        if not example_path.exists():
            violations.append(
                f"File: {rel_example} - Rule violated: Example event file for event '{event_type}' missing"
            )
            continue

        try:
            example_data = json.loads(example_path.read_text(encoding="utf-8"))
            agesoa_contracts.validate_event(example_data)
        except Exception as e:
            violations.append(
                f"File: {rel_example} - Rule violated: Example event failed schema validation: {e}"
            )

    # Orphan schema check: every .schema.json except cloudevent.schema.json must be in catalog
    all_schemas = set(p.name for p in events_dir.glob("*.schema.json"))
    orphan_schemas = all_schemas - catalog_schemas - {"cloudevent.schema.json"}
    for orphan in sorted(orphan_schemas):
        rel_orphan = (events_dir / orphan).relative_to(WORKSPACE_ROOT)
        violations.append(
            f"File: {rel_orphan} - Rule violated: Orphan schema file not listed in catalog.json"
        )

    assert not violations, "Event contract violations found:\n" + "\n".join(f"- {v}" for v in violations)
