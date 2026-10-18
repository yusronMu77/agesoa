import { describe, expect, test } from "bun:test";
import { categoryLabel, loadDomainPacks, localized, packName } from "./domainpacks";
import { loadConfig } from "./config";
import { shade } from "./geo";
import {
  actorCategory,
  casesPerDistrict,
  countByEvidence,
  distinctAreas,
  entryChainState,
  heatLegend,
  isActiveCase,
  middleHash,
  parseEvidenceFilter,
  rankDistricts,
  rankMostReported,
  shortDistrictName,
  windowAfter,
} from "./publicview";
import type { PublicCase, PublicDistrict, PublicFinding } from "./readmodel";

const region = (district: string | null, regency = "Kabupaten Sukamaju (fictional)") => ({
  regency_code: null,
  regency_name: regency,
  district_code: null,
  district_name: district,
});

function makeCase(id: string, over: Partial<PublicCase> = {}): PublicCase {
  return {
    case_id: id,
    synthetic: true,
    domain: "mbg",
    category: "poisoning",
    status: "open",
    evidence_status: null,
    max_finding_status: "supported",
    region: region("Kecamatan Cibening (fictional)"),
    report_count: 1,
    signal_count: 0,
    updated_at: "2026-10-16T10:00:00Z",
    ...over,
  };
}

function makeFinding(id: string, caseId: string, over: Partial<PublicFinding> = {}): PublicFinding {
  return {
    finding_id: id,
    synthetic: true,
    case_id: caseId,
    domain: "mbg",
    statement: `Statement ${id}`,
    status: "supported",
    evidence_count: 1,
    region: region("Kecamatan Cibening (fictional)"),
    validation: null,
    ...over,
  };
}

function makeDistrict(code: string, name: string, synthetic = true): PublicDistrict {
  return {
    district_code: code,
    district_name: name,
    regency_code: "R",
    regency_name: "Kabupaten Sukamaju (fictional)",
    geometry: "{}",
    synthetic,
  };
}

describe("evidence filter and counts", () => {
  test("accepts only the three evidence statuses", () => {
    expect(parseEvidenceFilter("supported")).toBe("supported");
    expect(parseEvidenceFilter(["proven", "alleged"])).toBe("proven");
    expect(parseEvidenceFilter("all")).toBeNull();
    expect(parseEvidenceFilter(undefined)).toBeNull();
    expect(parseEvidenceFilter("<script>")).toBeNull();
  });

  test("counts findings per status and ignores findings without one", () => {
    expect(countByEvidence([{ status: "supported" }, { status: "supported" }, { status: "alleged" }, { status: null }])).toEqual({
      alleged: 1,
      supported: 2,
      proven: 0,
    });
  });

  test("active cases and distinct areas", () => {
    expect(isActiveCase({ status: "open" })).toBe(true);
    expect(isActiveCase({ status: "investigating" })).toBe(true);
    expect(isActiveCase({ status: "closed" })).toBe(false);
    expect(isActiveCase({ status: null })).toBe(false);
    expect(
      distinctAreas([
        makeCase("a"),
        makeCase("b"),
        makeCase("c", { region: region(null, "Kabupaten Lain (fictional)") }),
        makeCase("d", { region: null }),
      ]),
    ).toBe(2);
  });
});

describe("cases per district", () => {
  const districts = [makeDistrict("D1", "Kecamatan Cibening (fictional)"), makeDistrict("D2", "Kecamatan Real", false)];

  test("joins by name for codeless fictional data and never mixes synthetic and real", () => {
    const counts = casesPerDistrict(
      [
        makeCase("a"),
        makeCase("b"),
        makeCase("c", { region: region("Kecamatan Real") }), // synthetic case on a real district: not drawn
        makeCase("d", { region: null }),
      ],
      districts,
    );
    expect(counts.perDistrict.get("D1")).toBe(2);
    expect(counts.perDistrict.get("D2")).toBeUndefined();
    expect(counts.unmapped.map((c) => c.case_id)).toEqual(["c", "d"]);
    expect(counts.max).toBe(2);
  });

  test("ranks districts with cases only, most first", () => {
    const ranked = rankDistricts(
      [makeDistrict("A", "Kecamatan B"), makeDistrict("B", "Kecamatan A"), makeDistrict("C", "Kecamatan C")],
      new Map([
        ["A", 2],
        ["B", 2],
        ["C", 5],
      ]),
      2,
    );
    expect(ranked.map((r) => [r.district.district_code, r.cases])).toEqual([
      ["C", 5],
      ["B", 2],
    ]);
    expect(rankDistricts(districts, new Map())).toEqual([]);
  });
});

describe("most reported cases", () => {
  test("orders by reports, then signals, then the latest update, and skips cases without any", () => {
    const ranked = rankMostReported(
      [
        makeCase("low", { report_count: 1 }),
        makeCase("none", { report_count: 0, signal_count: 0 }),
        makeCase("top", { report_count: 5 }),
        makeCase("tie-old", { report_count: 3, signal_count: 1, updated_at: "2026-10-01T00:00:00Z" }),
        makeCase("tie-new", { report_count: 3, signal_count: 1, updated_at: "2026-10-15T00:00:00Z" }),
      ],
      [makeFinding("F1", "top"), makeFinding("F2", "top", { statement: null }), makeFinding("F3", "low")],
      3,
    );
    expect(ranked.map((r) => [r.rank, r.case.case_id])).toEqual([
      [1, "top"],
      [2, "tie-new"],
      [3, "tie-old"],
    ]);
    expect(ranked[0].findings).toHaveLength(2);
    expect(ranked[0].title).toBe("Statement F1");
    expect(ranked[1].title).toBeNull();
  });

  test("prefers the audit report summary as the title", () => {
    const [first] = rankMostReported(
      [
        makeCase("r", {
          audit_report: { audit_report_id: "A", summary: "Summary", root_causes: [], recommendations: [], created_at: "" },
        }),
      ],
      [makeFinding("F", "r")],
    );
    expect(first.title).toBe("Summary");
    expect(first.title_i18n).toBeNull();
  });

  test("the title keeps the per-language text of whichever field it came from", () => {
    const [withReport] = rankMostReported(
      [
        makeCase("r", {
          audit_report: {
            audit_report_id: "A",
            summary: "Summary",
            summary_i18n: { id: "Ringkasan", en: "Summary" },
            root_causes: [],
            recommendations: [],
            created_at: "",
          },
        }),
      ],
      [makeFinding("F", "r")],
    );
    expect(withReport.title_i18n).toEqual({ id: "Ringkasan", en: "Summary" });
    const [fromFinding] = rankMostReported(
      [makeCase("s")],
      [{ ...makeFinding("G", "s"), statement_i18n: { id: "Pernyataan" } }],
    );
    expect(fromFinding.title_i18n).toEqual({ id: "Pernyataan" });
  });
});

describe("heat legend", () => {
  test("matches the fill levels of shade()", () => {
    for (const max of [1, 2, 3, 4, 5, 7, 13, 40]) {
      const legend = heatLegend(max);
      for (let n = 0; n <= max; n++) {
        const step = legend.find((s) => n >= s.from && n <= s.to);
        expect(step?.level).toBe(shade(n, max));
      }
    }
  });

  test("lists only levels a count falls into", () => {
    expect(heatLegend(0)).toEqual([{ level: 0, from: 0, to: 0 }]);
    expect(heatLegend(2)).toEqual([
      { level: 0, from: 0, to: 0 },
      { level: 2, from: 1, to: 1 },
      { level: 4, from: 2, to: 2 },
    ]);
    expect(heatLegend(13).map((s) => [s.from, s.to])).toEqual([
      [0, 0],
      [1, 3],
      [4, 6],
      [7, 9],
      [10, 13],
    ]);
  });
});

test("short district names keep the place name only", () => {
  expect(shortDistrictName("Kecamatan Cibening (fictional)")).toBe("Cibening");
  expect(shortDistrictName("Kec. Sukamaju Barat (fiktif)")).toBe("Sukamaju Barat");
  expect(shortDistrictName("Ranca Gede")).toBe("Ranca Gede");
});

describe("decision log entries", () => {
  const entry = (kind: string, name: string, service: string) => ({
    source_service: service,
    entry: { decision: { actor: { kind, name, service } } },
  });

  test("actor categories", () => {
    expect(actorCategory(entry("agent", "intake", "ingestion"))).toBe("agent");
    expect(actorCategory(entry("human", "Journalist (high tier validator)", "trust"))).toBe("validator");
    expect(actorCategory(entry("human", "institution: Badan Gizi (fictional)", "delivery"))).toBe("institution");
    expect(actorCategory(entry("human", "anonymous reporter", "ingestion"))).toBe("citizen");
    expect(actorCategory(entry("rule", "quorum", "trust"))).toBe("system");
    expect(actorCategory(entry("system", "institution_webhook", "delivery"))).toBe("system");
    expect(actorCategory({ source_service: "trust", entry: null })).toBe("system");
  });

  test("chain state from the verification of the whole chain", () => {
    const ok = { ok: true, length: 10, head_hash: "h", first_invalid_seq: null, reason: null };
    const broken = { ok: false, length: 10, head_hash: "h", first_invalid_seq: 5, reason: "prev_hash mismatch" };
    expect(entryChainState({ seq: 3, prev_hash: "x" }, ok, undefined)).toBe("intact");
    expect(entryChainState({ seq: 11, prev_hash: "x" }, ok, undefined)).toBe("unchecked");
    expect(entryChainState({ seq: 4, prev_hash: "x" }, broken, undefined)).toBe("intact");
    expect(entryChainState({ seq: 5, prev_hash: "x" }, broken, undefined)).toBe("mismatch");
    expect(entryChainState({ seq: 6, prev_hash: "x" }, broken, undefined)).toBe("untrusted");
  });

  test("chain state from the link to the previous entry when verification is unavailable", () => {
    expect(entryChainState({ seq: 2, prev_hash: "a" }, null, "a")).toBe("intact");
    expect(entryChainState({ seq: 2, prev_hash: "a" }, null, "b")).toBe("mismatch");
    expect(entryChainState({ seq: 2, prev_hash: "a" }, null, undefined)).toBe("unchecked");
  });

  test("page windows and hashes", () => {
    expect(windowAfter(1, 50)).toBe(0);
    expect(windowAfter(50, 50)).toBe(0);
    expect(windowAfter(51, 50)).toBe(50);
    expect(windowAfter(541, 50)).toBe(500);
    expect(windowAfter(0, 50)).toBe(0);
    expect(middleHash("9f2c41ab0000000000000000e8a41")).toBe("9f2c41ab…e8a41");
    expect(middleHash("short")).toBe("short");
    expect(middleHash(null)).toBe("—");
  });
});

describe("domain packs", () => {
  const packs = [
    {
      id: "mbg",
      name: { en: "Free school meals", id: "Makan Bergizi Gratis" },
      categories: [{ id: "poisoning", label: { en: "Food poisoning", id: "Keracunan" } }, "short_portion"],
    },
  ];

  test("names and category labels in the reader's language, ids as fallback", () => {
    expect(packName(packs, "mbg", "id")).toBe("Makan Bergizi Gratis");
    expect(packName(packs, "mbg", "fr")).toBe("Free school meals");
    expect(packName(packs, "roads", "en")).toBe("roads");
    expect(categoryLabel(packs, "poisoning", "en")).toBe("Food poisoning");
    expect(categoryLabel(packs, "short_portion", "en")).toBe("short_portion");
    expect(localized(undefined, "en")).toBeNull();
  });

  test("loads each pack once and skips packs the service does not answer for", async () => {
    const urls: string[] = [];
    const fetchImpl = async (url: string) => {
      urls.push(url);
      return url.endsWith("/mbg")
        ? new Response(JSON.stringify(packs[0]), { status: 200 })
        : new Response("{}", { status: 404 });
    };
    const loaded = await loadDomainPacks(loadConfig({}), ["mbg", "mbg", "roads", ""], { fetchImpl });
    expect(loaded.map((p) => p.id)).toEqual(["mbg"]);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toEndWith("/v1/domain-packs/mbg");
  });
});
