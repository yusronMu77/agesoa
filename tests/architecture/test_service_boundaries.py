"""Architecture Fitness Test: Service Boundaries.

Ensures no service package (agesoa_ingestion, agesoa_case_audit, agesoa_trust,
agesoa_delivery, agesoa_transparency) imports another service's package.
"""

import ast
import pathlib

WORKSPACE_ROOT = pathlib.Path(__file__).resolve().parents[2]

SERVICE_PACKAGES = {
    "ingestion": "agesoa_ingestion",
    "case-audit": "agesoa_case_audit",
    "trust": "agesoa_trust",
    "delivery": "agesoa_delivery",
    "transparency": "agesoa_transparency",
}
ALL_SVC_PKGS = set(SERVICE_PACKAGES.values())


def test_service_packages_do_not_import_other_services():
    violations = []
    for svc_dir, pkg_name in SERVICE_PACKAGES.items():
        src_dir = WORKSPACE_ROOT / "services" / svc_dir / "src"
        if not src_dir.exists():
            continue
        for py_file in src_dir.rglob("*.py"):
            try:
                tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(py_file))
            except Exception as e:
                rel_path = py_file.relative_to(WORKSPACE_ROOT)
                violations.append(f"File: {rel_path} - Rule violated: Syntax error: {e}")
                continue

            for node in ast.walk(tree):
                imported_pkg = None
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        imported_pkg = alias.name.split(".")[0]
                        if imported_pkg in ALL_SVC_PKGS and imported_pkg != pkg_name:
                            rel_path = py_file.relative_to(WORKSPACE_ROOT)
                            violations.append(
                                f"File: {rel_path} - Rule violated: Service '{pkg_name}' imports "
                                f"another service package '{imported_pkg}'"
                            )
                elif isinstance(node, ast.ImportFrom):
                    if node.module:
                        imported_pkg = node.module.split(".")[0]
                        if imported_pkg in ALL_SVC_PKGS and imported_pkg != pkg_name:
                            rel_path = py_file.relative_to(WORKSPACE_ROOT)
                            violations.append(
                                f"File: {rel_path} - Rule violated: Service '{pkg_name}' imports "
                                f"another service package '{imported_pkg}'"
                            )

    assert not violations, "Service boundary violations found:\n" + "\n".join(f"- {v}" for v in violations)
