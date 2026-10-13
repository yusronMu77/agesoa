"""Architecture Fitness Test: Decision Log Writer Boundary.

Ensures only the transparency service defines or writes to decision_log / chain_head tables.
"""

import ast
import pathlib

WORKSPACE_ROOT = pathlib.Path(__file__).resolve().parents[2]
SERVICES = ["ingestion", "case-audit", "trust", "delivery", "transparency"]


def test_only_transparency_service_writes_decision_log_table():
    violations = []
    for svc in SERVICES:
        if svc == "transparency":
            continue
        src_dir = WORKSPACE_ROOT / "services" / svc / "src"
        if not src_dir.exists():
            continue
        for py_file in src_dir.rglob("*.py"):
            content = py_file.read_text(encoding="utf-8")
            rel_path = py_file.relative_to(WORKSPACE_ROOT)

            if "decision_log" in content or "chain_head" in content:
                try:
                    tree = ast.parse(content, filename=str(py_file))
                except Exception:
                    tree = None

                violates = False
                if tree:
                    for node in ast.walk(tree):
                        if isinstance(node, ast.Constant) and isinstance(node.value, str):
                            if node.value in ("decision_log", "chain_head"):
                                violates = True
                                break
                else:
                    violates = True

                if violates:
                    violations.append(
                        f"File: {rel_path} - Rule violated: Only service 'transparency' "
                        "may define or write to decision_log / chain_head tables"
                    )

    assert not violations, "Decision log writer violations found:\n" + "\n".join(f"- {v}" for v in violations)
