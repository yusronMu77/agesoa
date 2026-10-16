"""Domain packs: load + validate, evaluate rules and the evidence deadline, synthetic scenarios. Domain-agnostic."""

from agesoa_packs.engine import (
    EvidenceStatus,
    RuleResult,
    evaluate_rules,
    evidence_anchor,
    evidence_status,
    parse_datetime,
)
from agesoa_packs.hypotheses import BranchRank, field_text, rank_branches
from agesoa_packs.loader import DomainPack, PackError, load_pack, load_packs, parse_pack
from agesoa_packs.metrics import Incident, MetricResult, branch_metrics, group_value, measure
from agesoa_packs.scenarios import Scenario, load_scenarios, parse_scenario

__all__ = [
    "BranchRank",
    "DomainPack",
    "EvidenceStatus",
    "Incident",
    "MetricResult",
    "PackError",
    "RuleResult",
    "Scenario",
    "branch_metrics",
    "evaluate_rules",
    "evidence_anchor",
    "evidence_status",
    "field_text",
    "group_value",
    "load_pack",
    "load_packs",
    "load_scenarios",
    "measure",
    "parse_datetime",
    "parse_pack",
    "parse_scenario",
    "rank_branches",
]
