import { describe, expect, test } from "bun:test";
import { createApiClient } from "@/services/http/api-client";
import { decodeFields } from "./firestore";
import { createReadModelService } from "./read-model.service";

const BASE = "http://fs.test/v1/projects/p/databases/(default)/documents";

function stub(responses: Record<string, unknown>, status = 200) {
  const urls: string[] = [];
  const fetchImpl = async (url: string) => {
    urls.push(url);
    const key = Object.keys(responses).find((k) => url.includes(k));
    return new Response(JSON.stringify(key ? responses[key] : {}), { status: key ? status : 404 });
  };
  return { readModel: createReadModelService(createApiClient({ baseUrl: BASE, fetchImpl })), urls };
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
});

describe("read model service", () => {
  test("lists every page of a collection", async () => {
    const { readModel, urls } = stub({
      "pageToken=next": { documents: [{ name: "b", fields: { id: { stringValue: "b" } } }] },
      public_cases: { documents: [{ name: "a", fields: { id: { stringValue: "a" } } }], nextPageToken: "next" },
    });
    const result = await readModel.listCollection<{ id: string }>("public_cases");
    expect(result.ok && result.data.map((d) => d.id)).toEqual(["a", "b"]);
    expect(urls).toEqual([`${BASE}/public_cases?pageSize=300`, `${BASE}/public_cases?pageSize=300&pageToken=next`]);
  });

  test("a missing document is ok with null data", async () => {
    const { readModel } = stub({});
    expect(await readModel.getDocument("public_cases/nope")).toMatchObject({ ok: true, data: null });
  });

  test("reads one case by its encoded id", async () => {
    const { readModel, urls } = stub({ "public_cases/K%201": { name: "c", fields: { case_id: { stringValue: "K 1" } } } });
    const result = await readModel.getCase("K 1");
    expect(result.ok && result.data?.case_id).toBe("K 1");
    expect(urls[0]).toBe(`${BASE}/public_cases/K%201`);
  });
});
