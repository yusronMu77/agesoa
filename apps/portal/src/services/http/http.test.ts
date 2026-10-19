import { describe, expect, test } from "bun:test";
import { buildUrl, createApiClient } from "./api-client";
import { errorDetail } from "./fetch-json";

function stub(status: number, body: unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  };
  return { fetchImpl, calls };
}

const headers = (init: RequestInit | undefined) => init?.headers as Record<string, string>;

describe("API client", () => {
  test("joins base URL, path and query; skips null and undefined parameters", () => {
    expect(buildUrl("http://s.test", "/v1/log", { limit: 50, after: undefined, kind: null })).toBe("http://s.test/v1/log?limit=50");
    expect(buildUrl("http://s.test", "/v1/log/head")).toBe("http://s.test/v1/log/head");
  });

  test("sends the session token as Bearer unless the call is anonymous", async () => {
    const { fetchImpl, calls } = stub(200, {});
    const client = createApiClient({ baseUrl: "http://s.test", token: "tok", fetchImpl });
    await client.get("/v1/me");
    await client.get("/v1/roles", { anonymous: true });
    expect(headers(calls[0].init).authorization).toBe("Bearer tok");
    expect(headers(calls[1].init).authorization).toBeUndefined();
  });

  test("POST and PUT send JSON; postForm sends the form as it is", async () => {
    const { fetchImpl, calls } = stub(200, {});
    const client = createApiClient({ baseUrl: "http://s.test", fetchImpl });
    await client.post("/a", { x: 1 });
    await client.put("/b", { y: 2 });
    const form = new FormData();
    form.set("k", "v");
    await client.postForm("/c", form);
    expect(calls.map((c) => c.init?.method)).toEqual(["POST", "PUT", "POST"]);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ x: 1 });
    expect(headers(calls[1].init)["content-type"]).toBe("application/json");
    expect(calls[2].init?.body).toBe(form);
    expect(headers(calls[2].init)["content-type"]).toBeUndefined();
  });

  test("a POST without a body sends no content type", async () => {
    const { fetchImpl, calls } = stub(201, {});
    await createApiClient({ baseUrl: "http://s.test", fetchImpl }).post("/key");
    expect(calls[0].init?.body).toBeUndefined();
    expect(headers(calls[0].init)["content-type"]).toBeUndefined();
  });
});

describe("FastAPI error details", () => {
  test("reads a string, a validation list, or falls back to the transport error", () => {
    expect(errorDetail({ status: 422, body: { detail: "webhook_url must use https" }, error: "HTTP 422" })).toBe(
      "webhook_url must use https",
    );
    expect(errorDetail({ status: 422, body: { detail: [{ msg: "Input should be a valid URL" }] }, error: "HTTP 422" })).toBe(
      "Input should be a valid URL",
    );
    expect(errorDetail({ status: null, body: null, error: "unreachable" })).toBe("unreachable");
  });
});
