import { describe, expect, test } from "bun:test";
import { centroid, containsPoint, distanceKm, districtAt, isAreaCode, nearbyCases } from "./nearby";
import type { Geometry } from "./geo";
import type { PublicCase, PublicDistrict, PublicFinding } from "./readmodel";

// A 0.1° square at the equator is about 11.1 km wide.
function square(lon: number, lat: number, size = 0.1): Geometry {
  return {
    type: "Polygon",
    coordinates: [[[lon, lat], [lon + size, lat], [lon + size, lat + size], [lon, lat + size], [lon, lat]]],
  };
}

function district(code: string, lon: number, synthetic = true): PublicDistrict {
  return {
    district_code: code,
    district_name: `Kecamatan ${code}`,
    regency_code: "R",
    regency_name: "Kabupaten R",
    geometry: JSON.stringify(square(lon, 0)),
    synthetic,
  };
}

function makeCase(id: string, districtCode: string, extra: Partial<PublicCase> = {}): PublicCase {
  return {
    case_id: id,
    synthetic: true,
    domain: "general",
    category: null,
    status: "open",
    evidence_status: null,
    max_finding_status: "supported",
    region: { regency_code: "R", regency_name: "Kabupaten R", district_code: districtCode, district_name: null },
    report_count: 1,
    signal_count: 0,
    updated_at: null,
    ...extra,
  };
}

function finding(id: string, caseId: string): PublicFinding {
  return {
    finding_id: id,
    synthetic: true,
    case_id: caseId,
    domain: "general",
    statement: `Statement ${id}`,
    status: "supported",
    evidence_count: 1,
    region: null,
    validation: null,
  };
}

describe("geometry", () => {
  test("centroid of a square is its centre", () => {
    const [lon, lat] = centroid(square(10, 20, 2))!;
    expect(lon).toBeCloseTo(11);
    expect(lat).toBeCloseTo(21);
  });

  test("distance between district centres in km", () => {
    expect(distanceKm([0, 0], [0.1, 0])).toBeCloseTo(11.12, 1);
  });

  test("point in polygon, holes excluded", () => {
    const withHole: Geometry = {
      type: "Polygon",
      coordinates: [
        [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
        [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]],
      ],
    };
    expect(containsPoint(withHole, 0.5, 0.5)).toBe(true);
    expect(containsPoint(withHole, 2, 2)).toBe(false);
    expect(containsPoint(withHole, 5, 5)).toBe(false);
  });

  test("districtAt resolves a point to a district, null outside the mapped area", () => {
    const ds = [district("A", 0), district("B", 0.1)];
    expect(districtAt(ds, 0.15, 0.05)?.district_code).toBe("B");
    expect(districtAt(ds, 5, 5)).toBeNull();
    expect(districtAt(ds, Number.NaN, 0)).toBeNull();
  });

  test("area codes accepted by the cookie", () => {
    expect(isAreaCode("32.04.01")).toBe(true);
    expect(isAreaCode("Kecamatan Cibening (fictional)")).toBe(true);
    expect(isAreaCode("<script>")).toBe(false);
    expect(isAreaCode("")).toBe(false);
  });
});

describe("nearbyCases", () => {
  const ds = [district("A", 0), district("B", 0.1), district("C", 0.3), district("Z", 0.1, false)];

  test("own district first, then by distance, within the radius only", () => {
    const cases = [makeCase("K-far", "C"), makeCase("K-near", "B"), makeCase("K-own", "A")];
    const rows = nearbyCases(ds[0], ds, cases, [finding("F1", "K-far"), finding("F2", "K-near"), finding("F3", "K-own")]);
    expect(rows.map((r) => r.case.case_id)).toEqual(["K-own", "K-near"]);
    expect(rows[0].sameArea).toBe(true);
    expect(rows[0].km).toBe(0);
    expect(rows[1].km).toBeCloseTo(11.12, 1);
    expect(rows[1].title).toBe("Statement F2");
  });

  test("cases without findings, or synthetic vs real mismatches, are left out", () => {
    const cases = [makeCase("K-none", "B"), makeCase("K-real", "Z")];
    expect(nearbyCases(ds[0], ds, cases, [finding("F", "K-real")])).toEqual([]);
  });

  test("the audit report summary is the title when there is one", () => {
    const c = makeCase("K", "A", {
      audit_report: { audit_report_id: "R", summary: "Summary", root_causes: [], recommendations: [], created_at: "" },
    });
    expect(nearbyCases(ds[0], ds, [c], [finding("F", "K")])[0].title).toBe("Summary");
  });
});
