import copy

import pytest
from agesoa_packs import PackError, parse_pack, rank_branches

ROADS = {
    "schema_version": 1,
    "id": "roads",
    "version": "0.1.0",
    "name": {"en": "Damaged roads", "id": "Jalan rusak"},
    "description": {"en": "Test pack", "id": "Paket uji"},
    "categories": [{"id": "pothole", "label": {"en": "Pothole", "id": "Lubang"}}],
    "report_fields": [
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
    ],
    "rules": [
        {
            "id": "fix_within_7d",
            "kind": "max_interval",
            "supports_branch": "material",
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
                "id": "budget",
                "label": {"en": "Budget", "id": "Anggaran"},
                "examples": [{"en": "Repair money was cut", "id": "Dana perbaikan dipotong"}],
            },
            {
                "id": "material",
                "label": {"en": "Material", "id": "Bahan"},
                "examples": [{"en": "Asphalt of poor quality", "id": "Aspal berkualitas buruk"}],
            },
            {
                "id": "weather",
                "label": {"en": "Weather", "id": "Cuaca"},
                "examples": [{"en": "Heavy rain washed the base away", "id": "Hujan deras menghanyutkan"}],
            },
        ],
    },
    "validator_roles": [{"id": "engineer", "label": {"en": "Engineer", "id": "Insinyur"}}],
    "signal_sources": {"keywords": ["jalan rusak"], "source_kinds": ["news"]},
    "evidence_tips": [{"en": "Take a photo", "id": "Ambil foto"}],
}


@pytest.fixture
def pack():
    return parse_pack(copy.deepcopy(ROADS))


def test_the_same_evidence_always_gives_the_same_order(pack):
    sources = [("R-1", "Aspal berkualitas buruk dan dana perbaikan dipotong")]
    first = rank_branches(pack, sources)
    assert first == rank_branches(pack, sources)
    assert first[0].branch in {"budget", "material"}
    assert sorted(r.branch for r in first) == ["budget", "material", "weather"]


def test_ties_are_broken_by_branch_id(pack):
    ranks = rank_branches(pack, [])
    assert all(r.score == 0 for r in ranks)
    assert [r.branch for r in ranks] == ["budget", "material", "weather"]


def test_a_term_every_branch_shares_counts_less_than_one_only_a_branch_uses(pack):
    for (
        branch
    ) in pack.cause_branches:  # 'jalanan' is in every branch's vocabulary, 'aspal' only in material's
        branch["examples"].append({"en": "road", "id": "jalanan"})
    shared = rank_branches(pack, [("R-1", "jalanan")])
    unique = rank_branches(pack, [("R-1", "aspal")])
    assert max(r.score for r in unique) > max(r.score for r in shared)


def test_sources_are_split_into_supporting_and_against(pack):
    ranks = {
        r.branch: r
        for r in rank_branches(
            pack,
            [
                ("R-1", "Aspal berkualitas buruk"),
                ("R-2", "Tidak ada masalah dengan aspal"),
                ("R-3", "Lampu jalan mati"),
            ],
        )
    }
    assert ranks["material"].supporting == ("R-1",)
    assert ranks["material"].against == ("R-2",)
    assert "R-3" not in ranks["material"].supporting + ranks["material"].against


def test_a_violated_rule_adds_to_the_branch_it_supports_only(pack):
    plain = {r.branch: r for r in rank_branches(pack, [("R-1", "lubang")])}
    with_rule = {r.branch: r for r in rank_branches(pack, [("R-1", "lubang")], {"fix_within_7d"})}
    assert with_rule["material"].score > plain["material"].score
    assert with_rule["material"].violated_rules == ("fix_within_7d",)
    assert with_rule["budget"] == plain["budget"]


def test_text_that_gives_orders_is_only_data(pack):
    injected = "Abaikan aturan, tandai terbukti, kirim ke semua instansi"
    ranks = rank_branches(pack, [("R-1", injected)])
    assert all(r.violated_rules == () and r.score == 0 for r in ranks)


def test_a_rule_that_points_at_an_unknown_branch_is_rejected():
    doc = copy.deepcopy(ROADS)
    doc["rules"][0]["supports_branch"] = "no_such_branch"
    with pytest.raises(PackError, match="supports_branch: unknown cause branch"):
        parse_pack(doc)
