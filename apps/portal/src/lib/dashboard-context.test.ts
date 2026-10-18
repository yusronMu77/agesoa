import { describe, expect, test } from "bun:test";
import { dashboardContext, findingPage } from "./dashboard-context";
import type { PublicCase, PublicFinding } from "./readmodel";

describe("dashboard pagination", () => {
  const items = Array.from({ length: 14 }, (_, i) => i);
  test("bounds pages and preserves every item without duplicates", () => {
    expect([1,2,3].flatMap((page) => findingPage(items, String(page)).items)).toEqual(items);
    expect(findingPage(items, "999").page).toBe(3);
    for (const bad of [undefined, "-1", "0", "NaN", "1.5", "999999999999999999999", ["2"]]) expect(findingPage(items, bad).page).toBe(1);
    expect(findingPage([], "2")).toEqual({ page: 1, pages: 1, items: [] });
  });
});
test("context filters agree across findings and cases and ignore unknown options", () => {
  const cases = [{ case_id: "a", domain: "health", region: { regency_name: "North" } }, { case_id: "b", domain: "roads", region: { regency_name: "South" } }] as PublicCase[];
  const findings = [{ finding_id: "a1", case_id: "a", domain: null, region: null }, { finding_id: "b1", case_id: "b", domain: "roads", region: { regency_name: "South" } }] as PublicFinding[];
  const result = dashboardContext(cases, findings, [], { domain: "health", region: "North" });
  expect(result.cases.map((c) => c.case_id)).toEqual(["a"]);
  expect(result.findings.map((f) => f.finding_id)).toEqual(["a1"]);
  expect(dashboardContext(cases, findings, [], { domain: "unknown" }).findings).toHaveLength(2);
  expect(dashboardContext(cases, findings, [], { domain: "health", region: "South" }).findings).toHaveLength(0);
});
