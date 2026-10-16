import copy

import pytest
from agesoa_packs import Incident, PackError, branch_metrics, group_value, measure, parse_pack

ROADS = {
    "schema_version": 1,
    "id": "roads",
    "version": "0.1.0",
    "name": {"en": "Damaged roads", "id": "Jalan rusak"},
    "description": {"en": "Test pack", "id": "Paket uji"},
    "categories": [{"id": "pothole", "label": {"en": "Pothole", "id": "Lubang"}}],
    "report_fields": [
        {
            "id": "contractor",
            "type": "string",
            "required": True,
            "label": {"en": "Contractor", "id": "Kontraktor"},
        },
        {"id": "street", "type": "string", "required": False, "label": {"en": "Street", "id": "Jalan"}},
        {
            "id": "reported_at",
            "type": "datetime",
            "required": True,
            "label": {"en": "Reported", "id": "Lapor"},
        },
        {
            "id": "fixed_at",
            "type": "datetime",
            "required": False,
            "label": {"en": "Fixed", "id": "Diperbaiki"},
        },
        {"id": "holes", "type": "integer", "required": False, "label": {"en": "Holes", "id": "Lubang"}},
    ],
    "rules": [
        {
            "id": "fix_within_7d",
            "kind": "max_interval",
            "label": {"en": "Fixed within 7 days", "id": "Diperbaiki dalam 7 hari"},
            "params": {"from_field": "reported_at", "to_field": "fixed_at", "max_minutes": 10080},
        }
    ],
    "evidence_deadline": {
        "anchor_field": "reported_at",
        "hours": 72,
        "after_deadline_max_status": "supported",
    },
    "evidence_ladder": [
        {"status": "proven", "evidence": [{"en": "Inspection", "id": "Inspeksi"}]},
        {"status": "supported", "evidence": [{"en": "Photo", "id": "Foto"}]},
        {"status": "alleged", "evidence": [{"en": "Report", "id": "Laporan"}]},
    ],
    "cause_framework": {
        "method": "fishbone",
        "branches": [
            {
                "id": "material",
                "label": {"en": "Material", "id": "Bahan"},
                "examples": [{"en": "Poor asphalt", "id": "Aspal buruk"}],
                "pattern_metrics": ["jobs_per_contractor", "slow_fixes_per_contractor"],
            },
            {
                "id": "weather",
                "label": {"en": "Weather", "id": "Cuaca"},
                "examples": [{"en": "Rain", "id": "Hujan"}],
            },
        ],
    },
    "pattern_metrics": [
        {
            "id": "jobs_per_contractor",
            "kind": "count_by",
            "label": {"en": "Reports per contractor", "id": "Laporan per kontraktor"},
            "params": {"group_by": "contractor"},
        },
        {
            "id": "streets_per_contractor",
            "kind": "count_by",
            "label": {"en": "Streets per contractor", "id": "Jalan per kontraktor"},
            "params": {"group_by": "contractor", "distinct": "street"},
        },
        {
            "id": "holes_per_contractor",
            "kind": "sum_by",
            "label": {"en": "Holes per contractor", "id": "Lubang per kontraktor"},
            "params": {"group_by": "contractor", "field": "holes"},
        },
        {
            "id": "days_to_fix",
            "kind": "interval_minutes",
            "label": {"en": "Minutes to fix", "id": "Menit perbaikan"},
            "params": {"group_by": "contractor", "from_field": "reported_at", "to_field": "fixed_at"},
        },
        {
            "id": "slow_fixes_per_contractor",
            "kind": "violations_by",
            "label": {"en": "Slow fixes", "id": "Perbaikan lambat"},
            "params": {"group_by": "contractor", "rule": "fix_within_7d"},
        },
    ],
    "validator_roles": [{"id": "engineer", "label": {"en": "Engineer", "id": "Insinyur"}}],
    "signal_sources": {"keywords": ["jalan rusak"], "source_kinds": ["news"]},
    "evidence_tips": [{"en": "Take a photo", "id": "Ambil foto"}],
}


@pytest.fixture
def pack():
    return parse_pack(copy.deepcopy(ROADS))


def incident(report_id, case_id, contractor="CV Maju", **fields):
    slow = fields.pop("slow", None)
    results = () if slow is None else ({"rule_id": "fix_within_7d", "violated": slow},)
    return Incident(report_id, case_id, {"contractor": contractor, **fields}, results)


def test_group_values_are_compared_without_case_and_extra_space():
    assert group_value("  CV  Maju ") == group_value("cv maju") == "cv maju"
    assert group_value("") is None
    assert group_value(None) is None
    assert group_value(["a"]) is None


def test_count_by_counts_the_reports_of_the_group_only(pack):
    rows = [incident("R-1", "C-1"), incident("R-2", "C-2"), incident("R-3", "C-3", "CV Lain")]
    result = measure(pack.pattern_metrics["jobs_per_contractor"], "cv maju", rows, case_id="C-1")
    assert (result.value, result.n, result.incidents) == (2, 2, ("R-1", "R-2"))


def test_a_pattern_recurs_only_through_an_incident_of_another_case(pack):
    metric = pack.pattern_metrics["jobs_per_contractor"]
    own = [incident("R-1", "C-1"), incident("R-2", "C-1")]
    alone = measure(metric, "cv maju", own, case_id="C-1")
    assert alone.value == 2 and not alone.recurs
    elsewhere = measure(metric, "cv maju", [*own, incident("R-9", "C-7")], case_id="C-1")
    assert elsewhere.recurs and elsewhere.other_cases == ("C-7",)


def test_count_by_distinct_counts_distinct_values(pack):
    rows = [
        incident("R-1", "C-1", street="Jl. A"),
        incident("R-2", "C-2", street="jl. a"),
        incident("R-3", "C-3", street="Jl. B"),
    ]
    assert measure(pack.pattern_metrics["streets_per_contractor"], "cv maju", rows, case_id=None).value == 2


def test_sum_by_adds_non_negative_integers_and_skips_the_rest(pack):
    rows = [
        incident("R-1", "C-1", holes=4),
        incident("R-2", "C-2", holes=-3),
        incident("R-3", "C-3", holes="many"),
    ]
    assert measure(pack.pattern_metrics["holes_per_contractor"], "cv maju", rows, case_id=None).value == 4


def test_interval_minutes_is_the_mean_of_measurable_incidents(pack):
    metric = pack.pattern_metrics["days_to_fix"]
    rows = [
        incident("R-1", "C-1", reported_at="2026-10-01T08:00:00+07:00", fixed_at="2026-10-01T09:00:00+07:00"),
        incident("R-2", "C-2", reported_at="2026-10-02T08:00:00+07:00", fixed_at="2026-10-02T11:00:00+07:00"),
        incident("R-3", "C-3", reported_at="2026-10-03T08:00:00+07:00"),  # not fixed yet
        incident("R-4", "C-4", reported_at="2026-10-04T08:00:00+07:00", fixed_at="2026-10-04T07:00:00+07:00"),
    ]
    result = measure(metric, "cv maju", rows, case_id=None)
    assert result.value == 120.0 and result.n == 4
    assert measure(metric, "cv maju", rows[2:3], case_id=None).value is None


def test_violations_by_counts_only_violated_results_of_the_named_rule(pack):
    rows = [incident("R-1", "C-1", slow=True), incident("R-2", "C-2", slow=False), incident("R-3", "C-3")]
    assert (
        measure(pack.pattern_metrics["slow_fixes_per_contractor"], "cv maju", rows, case_id=None).value == 1
    )


def test_branch_metrics_follow_the_branch_order(pack):
    ids = [m["id"] for m in branch_metrics(pack, "material")]
    assert ids == ["jobs_per_contractor", "slow_fixes_per_contractor"]
    assert branch_metrics(pack, "weather") == []
    with pytest.raises(ValueError, match="unknown cause branch"):
        branch_metrics(pack, "nope")


@pytest.mark.parametrize(
    ("change", "message"),
    [
        (lambda d: d["pattern_metrics"][0]["params"].update(group_by="holes"), "must be of type string"),
        (lambda d: d["pattern_metrics"][0]["params"].update(group_by="nope"), "unknown report field"),
        (lambda d: d["pattern_metrics"][2]["params"].update(field="street"), "must be of type integer"),
        (lambda d: d["pattern_metrics"][3]["params"].update(to_field="street"), "must be of type datetime"),
        (lambda d: d["pattern_metrics"][4]["params"].update(rule="nope"), "unknown rule"),
        (lambda d: d["cause_framework"]["branches"][0].update(pattern_metrics=["nope"]), "unknown metric"),
        (lambda d: d["pattern_metrics"].append(copy.deepcopy(d["pattern_metrics"][0])), "duplicate id"),
        (lambda d: d["pattern_metrics"][0].update(kind="free_sql"), "free_sql"),
        (lambda d: d["pattern_metrics"][2]["params"].pop("field"), "field"),
    ],
)
def test_a_pack_with_a_broken_metric_is_refused(change, message):
    document = copy.deepcopy(ROADS)
    change(document)
    with pytest.raises(PackError, match=message):
        parse_pack(document)
