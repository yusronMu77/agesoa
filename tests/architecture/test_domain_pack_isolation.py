"""Architecture Fitness Test: Domain Pack Isolation.

Ensures libs/ and services/*/src do not contain MBG domain-specific logic or terms.
The terms list is extracted dynamically from domain-packs/mbg/pack.json rather than hardcoded.
"""

import json
import pathlib
import re

WORKSPACE_ROOT = pathlib.Path(__file__).resolve().parents[2]
SERVICES = ["ingestion", "case-audit", "trust", "delivery", "transparency"]


def extract_mbg_terms() -> set[str]:
    pack_path = WORKSPACE_ROOT / "domain-packs" / "mbg" / "pack.json"
    if not pack_path.exists():
        raise FileNotFoundError(f"Pack file not found at {pack_path}")

    with open(pack_path, encoding="utf-8") as f:
        pack = json.load(f)

    terms = set()
    pack_id = pack.get("id", "").lower()

    # Category IDs & Rule IDs
    for cat in pack.get("categories", []):
        if "id" in cat:
            terms.add(cat["id"])
    for rule in pack.get("rules", []):
        if "id" in rule:
            terms.add(rule["id"])

    # Validator roles
    for role in pack.get("validator_roles", []):
        if "id" in role:
            terms.add(role["id"])

    # Signal sources keywords & official publishers
    sig = pack.get("signal_sources", {})
    for kw in sig.get("keywords", []):
        terms.add(kw.strip().lower())
    for pub in sig.get("official_publishers", []):
        terms.add(pub.strip().lower())

    # Intake hints categories & vocabulary keywords
    intake = pack.get("intake_hints", {})
    for cat_kws in intake.get("categories", {}).values():
        for kw in cat_kws:
            if len(kw.strip()) > 2:
                terms.add(kw.strip().lower())

    for field_info in intake.get("fields", {}).values():
        for vocab_list in field_info.get("vocabulary", {}).values():
            for kw in vocab_list:
                if len(kw.strip()) > 2:
                    terms.add(kw.strip().lower())

    # Extract terms from localized label objects {"en": ..., "id": ...}
    def extract_label_terms(obj):
        if isinstance(obj, dict):
            if "en" in obj and "id" in obj and isinstance(obj["id"], str):
                text = obj["id"]
                for match in re.findall(r"\b[A-Z]{2,}\b", text):
                    if match.lower() != pack_id:
                        terms.add(match.lower())
            for v in obj.values():
                extract_label_terms(v)
        elif isinstance(obj, list):
            for item in obj:
                extract_label_terms(item)

    extract_label_terms(pack)
    terms.discard(pack_id)
    return terms


def test_core_libs_and_services_do_not_contain_mbg_domain_terms():
    terms = extract_mbg_terms()
    violations = []

    target_files = []
    libs_dir = WORKSPACE_ROOT / "libs"
    if libs_dir.exists():
        target_files.extend(libs_dir.rglob("*.py"))

    for svc_dir in SERVICES:
        src_dir = WORKSPACE_ROOT / "services" / svc_dir / "src"
        if src_dir.exists():
            target_files.extend(src_dir.rglob("*.py"))

    for py_file in target_files:
        content = py_file.read_text(encoding="utf-8").lower()
        rel_path = py_file.relative_to(WORKSPACE_ROOT)
        for term in terms:
            pattern = r"(?<![a-zA-Z0-9_])" + re.escape(term) + r"(?![a-zA-Z0-9_])"
            if re.search(pattern, content):
                violations.append(
                    f"File: {rel_path} - Rule violated: Service or library code contains "
                    f"MBG domain-specific term '{term}'"
                )

    assert not violations, "Domain pack isolation violations found:\n" + "\n".join(
        f"- {v}" for v in violations
    )
