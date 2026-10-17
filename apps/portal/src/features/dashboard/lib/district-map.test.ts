import { describe, expect, test } from "bun:test";
import type { PublicCase, PublicDistrict } from "@/services/read-model/read-model.model";
import { buildDistrictMap, districtKey, total } from "./district-map";
import { projectShapes, shade } from "./geo";

const square = (x: number) => ({
  type: "Polygon" as const,
  coordinates: [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]] as [number, number][][],
});

describe("map projection", () => {
  test("fits every shape in the box, north up", () => {
    const [a, b] = projectShapes([{ key: "a", geometry: square(0) }, { key: "b", geometry: square(1) }], 200, 100, 0);
    expect(a.path.startsWith("M")).toBe(true);
    expect(a.cx).toBeLessThan(b.cx);
    for (const p of [a, b]) {
      for (const n of p.path.match(/-?\d+(\.\d+)?/g)!.map(Number)) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(200);
      }
    }
  });

  test("shade is 0 without cases and 4 for the busiest district", () => {
    expect(shade(0, 5)).toBe(0);
    expect(shade(5, 5)).toBe(4);
    expect(shade(1, 5)).toBe(1);
  });
});

describe("cases per district", () => {
  test("district key prefers the code", () => {
    expect(districtKey({ district_code: "99.01.01", district_name: "X" })).toBe("99.01.01");
    expect(districtKey({ district_code: null, district_name: "X" })).toBe("X");
    expect(districtKey(null)).toBeNull();
  });

  const district = (code: string, name: string, synthetic: boolean): PublicDistrict => ({
    district_code: code,
    district_name: name,
    regency_code: "99.01",
    regency_name: "Kabupaten Contoh",
    geometry: JSON.stringify(square(Number(code.slice(-1)))),
    synthetic,
  });
  const kase = (id: string, region: Partial<PublicCase["region"]> | null, synthetic: boolean) =>
    ({ case_id: id, synthetic, region, report_count: 1, signal_count: 0 }) as PublicCase;

  test("counts by code or name and never mixes synthetic and real data", () => {
    const map = buildDistrictMap(
      [
        kase("K-1", { district_code: "99.01.01", district_name: "A" }, true),
        kase("K-2", { district_code: null, district_name: "A" }, true),
        kase("K-3", { district_code: "99.01.02", district_name: "B" }, false),
        kase("K-4", null, true),
      ],
      [district("99.01.01", "A", true), district("99.01.02", "B", true)],
    );
    expect(map.casesPerDistrict.get("99.01.01")).toBe(2);
    expect(map.casesPerDistrict.get("99.01.02")).toBeUndefined();
    expect(map.unmapped.map((c) => c.case_id)).toEqual(["K-3", "K-4"]);
    expect(map.max).toBe(2);
    expect(map.regencies).toEqual(["Kabupaten Contoh"]);
    expect(map.shapes).toHaveLength(2);
  });

  test("totals of the stats document", () => {
    expect(total({ approved: 2, rejected: 1 })).toBe(3);
    expect(total(undefined)).toBe(0);
  });
});
