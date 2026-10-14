import { describe, expect, test } from "bun:test";
import { loadConfig } from "./config";
import { projectShapes, shade } from "./geo";
import { decodeFields, districtKey, getDocument, listCollection } from "./readmodel";

const config = loadConfig({ READ_MODEL_URL: "http://fs.test/v1/projects/p/databases/(default)/documents" });

function stub(responses: Record<string, unknown>, status = 200) {
  const urls: string[] = [];
  const fetchImpl = async (url: string) => {
    urls.push(url);
    const key = Object.keys(responses).find((k) => url.includes(k));
    return new Response(JSON.stringify(key ? responses[key] : {}), { status: key ? status : 404 });
  };
  return { fetchImpl, urls };
}

describe("Firestore REST decoding", () => {
  test("decodes nested values", () => {
    expect(
      decodeFields({
        case_id: { stringValue: "K-1" },
        report_count: { integerValue: "3" },
        synthetic: { booleanValue: true },
        region: { mapValue: { fields: { district_name: { stringValue: "Cibening" }, district_code: { nullValue: null } } } },
        decisions: { arrayValue: { values: [{ mapValue: { fields: { tier: { stringValue: "high" } } } }] } },
        empty: { arrayValue: {} },
      }),
    ).toEqual({
      case_id: "K-1",
      report_count: 3,
      synthetic: true,
      region: { district_name: "Cibening", district_code: null },
      decisions: [{ tier: "high" }],
      empty: [],
    });
  });

  test("lists every page of a collection", async () => {
    const { fetchImpl, urls } = stub({
      "pageToken=next": { documents: [{ name: "b", fields: { id: { stringValue: "b" } } }] },
      public_cases: { documents: [{ name: "a", fields: { id: { stringValue: "a" } } }], nextPageToken: "next" },
    });
    const result = await listCollection<{ id: string }>(config, "public_cases", { fetchImpl });
    expect(result.ok && result.data.map((d) => d.id)).toEqual(["a", "b"]);
    expect(urls).toHaveLength(2);
  });

  test("a missing document is ok with null data", async () => {
    const { fetchImpl } = stub({});
    const result = await getDocument(config, "public_cases/nope", { fetchImpl });
    expect(result).toMatchObject({ ok: true, data: null });
  });

  test("district key prefers the code", () => {
    expect(districtKey({ district_code: "99.01.01", district_name: "X" })).toBe("99.01.01");
    expect(districtKey({ district_code: null, district_name: "X" })).toBe("X");
    expect(districtKey(null)).toBeNull();
  });
});

describe("map projection", () => {
  const square = (x: number) => ({
    type: "Polygon" as const,
    coordinates: [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]] as [number, number][][],
  });

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

describe("validator labels", () => {
  test("role + tier + regency, never a name; older documents fall back to the tier", async () => {
    const { validatorLabel } = await import("../components/ValidatedBy");
    expect(validatorLabel({ tier: "high", decision: "approve", role_label: "Journalist", regency_name: "Kabupaten X" })).toBe(
      "Journalist (high tier), Kabupaten X",
    );
    expect(validatorLabel({ tier: "medium", decision: "approve" })).toBe("medium tier validator");
  });
});
