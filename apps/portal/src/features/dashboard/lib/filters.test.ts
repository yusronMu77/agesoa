import { describe, expect, test } from "bun:test";
import type { PublicCase, PublicDistrict, PublicFinding } from "@/services/read-model/read-model.model";
import type { LogEntry } from "@/services/transparency/transparency.model";
import { shortDistrictName } from "./district-map";
import { applyFilters, countByStatus, filterHref, filterOptions, humanize, parseFilters } from "./filters";
import { projectShapes, scaleBar } from "./geo";
import { actionLabel, actorLabel, hashPreview, timeWib } from "./log-entry";

const region = (code: string, regency = "99.01") => ({
  regency_code: regency,
  regency_name: `Regency ${regency}`,
  district_code: code,
  district_name: `Kecamatan ${code} (fictional)`,
});

const kase = (id: string, category: string, regency = "99.01"): PublicCase => ({
  case_id: id,
  synthetic: true,
  domain: "pack",
  category,
  status: "open",
  evidence_status: null,
  max_finding_status: null,
  region: region(`${regency}.01`, regency),
  report_count: 2,
  signal_count: 0,
  updated_at: null,
});

const finding = (id: string, caseId: string, status: PublicFinding["status"], regency = "99.01"): PublicFinding => ({
  finding_id: id,
  synthetic: true,
  case_id: caseId,
  domain: "pack",
  statement: id,
  status,
  evidence_count: 1,
  region: region(`${regency}.01`, regency),
  validation: null,
});

const district = (code: string, regency: string): PublicDistrict => ({
  district_code: code,
  district_name: `Kecamatan ${code}`,
  regency_code: regency,
  regency_name: `Regency ${regency}`,
  geometry: "{}",
  synthetic: true,
});

describe("dashboard filters", () => {
  test("parses only known values", () => {
    expect(parseFilters({ type: "poisoning", region: "99.01", status: "proven" })).toEqual({
      type: "poisoning",
      region: "99.01",
      status: "proven",
    });
    expect(parseFilters({ type: ["a", "b"], region: "", status: "certain" })).toEqual({ type: null, region: null, status: null });
  });

  test("category ids read as words", () => {
    expect(humanize("kitchen_hygiene")).toBe("Kitchen hygiene");
    expect(humanize("spoiled-food")).toBe("Spoiled food");
  });

  test("options come from the cases and districts", () => {
    const { types, regions } = filterOptions([kase("A", "b_type"), kase("B", "a_type")], [district("99.01.01", "99.01")]);
    expect(types.map((t) => t.value)).toEqual(["a_type", "b_type"]);
    expect(regions).toEqual([{ value: "99.01", label: "Regency 99.01" }]);
  });

  test("issue type and region narrow cases and findings; status narrows only the list", () => {
    const data = {
      cases: [kase("A", "poisoning"), kase("B", "hygiene"), kase("C", "poisoning", "99.02")],
      districts: [district("99.01.01", "99.01"), district("99.02.01", "99.02")],
      findings: [finding("F1", "A", "supported"), finding("F2", "B", "proven"), finding("F3", "C", "supported", "99.02")],
    };
    const view = applyFilters(data, { type: "poisoning", region: "99.01", status: "proven" });
    expect(view.cases.map((c) => c.case_id)).toEqual(["A"]);
    expect(view.districts.map((d) => d.district_code)).toEqual(["99.01.01"]);
    expect(view.findings.map((f) => f.finding_id)).toEqual(["F1"]);
    expect(view.listed).toEqual([]);
    expect(countByStatus(data.findings)).toEqual({ alleged: 0, supported: 2, proven: 1 });
  });

  test("links keep the other filters", () => {
    const filters = { type: "poisoning", region: null, status: null };
    expect(filterHref(filters, { status: "proven" })).toBe("/dashboard?type=poisoning&status=proven");
    expect(filterHref({ type: null, region: null, status: "alleged" }, { status: null })).toBe("/dashboard");
  });
});

describe("map labels and scale", () => {
  test("district labels drop the prefix and the fictional suffix", () => {
    expect(shortDistrictName("Kecamatan Cibening (fictional)")).toBe("Cibening");
    expect(shortDistrictName("Kecamatan Lembang")).toBe("Lembang");
  });

  test("label sits at the area centroid, not the bounding box centre", () => {
    // An L-shaped district: the bounding box centre (1, 1) lies outside the shape.
    const l = { type: "Polygon" as const, coordinates: [[[0, 0], [2, 0], [2, 0.5], [0.5, 0.5], [0.5, 2], [0, 2], [0, 0]]] as [number, number][][] };
    const [p] = projectShapes([{ key: "l", geometry: l }], 200, 200, 0);
    expect(p.cx).toBeLessThan(100);
    expect(p.cy).toBeGreaterThan(100);
  });

  test("scale bar is a round distance that fits", () => {
    const box = { type: "Polygon" as const, coordinates: [[[106.8, -7.05], [107.1, -7.05], [107.1, -6.85], [106.8, -6.85], [106.8, -7.05]]] as [number, number][][] };
    const bar = scaleBar([{ geometry: box }], 560, 440, 120)!;
    expect([1, 2, 5, 10, 20, 50]).toContain(bar.km);
    expect(bar.units).toBeLessThanOrEqual(120);
    expect(bar.units).toBeGreaterThan(0);
  });
});

describe("latest log lines", () => {
  const entry = (kind: string, service: string): LogEntry => ({
    seq: 1,
    event_id: "e",
    decision_id: "d",
    source_service: service,
    action: "finding.approved",
    subject_kind: "finding",
    subject_id: "F",
    entry: { decision: { actor: { kind, name: "Journalist (high tier validator)" } } },
    prev_hash: "0",
    hash: "9f2c41ab00000000000000000000e8a41",
    recorded_at: "2026-10-18T12:29:14Z",
  });

  test("actions read as sentences, unknown ones as words", () => {
    expect(actionLabel("finding.validated")).toBe("Finding validated by the quorum");
    expect(actionLabel("case.closed")).toBe("Case closed");
  });

  test("actors by role, never by name", () => {
    expect(actorLabel(entry("human", "trust"))).toBe("Validator");
    expect(actorLabel(entry("rule", "case-audit"))).toBe("Rule");
    expect(actorLabel(entry("agent", "case-audit"))).toBe("AI agent");
  });

  test("time in WIB and a short hash", () => {
    expect(timeWib("2026-10-18T12:29:14Z")).toBe("19.29 WIB");
    expect(hashPreview("9f2c41ab00000000000000000000e8a41")).toBe("9f2c41ab…e8a41");
  });
});
