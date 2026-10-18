import { describe, expect, test } from "bun:test";
import { loadConfig } from "./config";
import {
  attemptsSummary,
  createApiKey,
  DELIVERY_STATUS_LABEL,
  errorDetail,
  getInstitution,
  listDeliveries,
  optionalField,
  saveSubscription,
  sendTestEvent,
} from "./institutions";

const config = loadConfig({});

function stub(status: number, body: unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  };
  return { fetchImpl, calls };
}

const header = (init: RequestInit | undefined, name: string) => (init?.headers as Record<string, string>)[name];

describe("agency dashboard calls to delivery", () => {
  test("reads the institution with the session token", async () => {
    const { fetchImpl, calls } = stub(200, { organization_id: "ORG-1", subscription: null, api_key: null });
    const result = await getInstitution(config, "tok", "ORG 1", { fetchImpl });
    expect(result.ok).toBe(true);
    expect(calls[0].url).toBe("http://localhost:8004/v1/institutions/ORG%201");
    expect(calls[0].init?.method).toBe("GET");
    expect(header(calls[0].init, "authorization")).toBe("Bearer tok");
  });

  test("a 404 (not the admin of a verified agency) is returned, not thrown", async () => {
    const { fetchImpl } = stub(404, { detail: "institution not found" });
    const result = await getInstitution(config, "tok", "ORG-1", { fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });

  test("saves the webhook with PUT and returns the one-time secret", async () => {
    const { fetchImpl, calls } = stub(200, { subscription: { id: "SUB-1", webhook_url: "https://x.test/h" }, secret: "whsec_abc" });
    const result = await saveSubscription(
      config,
      "tok",
      "ORG-1",
      { webhook_url: "https://x.test/h", region_code: null, category: "mbg" },
      { fetchImpl },
    );
    expect(calls[0].url).toEndWith(":8004/v1/institutions/ORG-1/subscription");
    expect(calls[0].init?.method).toBe("PUT");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ webhook_url: "https://x.test/h", region_code: null, category: "mbg" });
    expect(result.ok && result.data.secret).toBe("whsec_abc");
  });

  test("creates an API key and queues a test event with POST", async () => {
    const key = stub(201, { api_key: "agk_secret", prefix: "agk_secret", created_at: "2026-10-16T00:00:00Z" });
    const created = await createApiKey(config, "tok", "ORG-1", { fetchImpl: key.fetchImpl });
    expect(key.calls[0].url).toEndWith("/v1/institutions/ORG-1/api-key");
    expect(key.calls[0].init?.method).toBe("POST");
    expect(created.ok && created.status).toBe(201);

    const event = stub(202, { delivery_id: "DLV-1", event_id: "EVT-1" });
    const queued = await sendTestEvent(config, "tok", "ORG-1", { fetchImpl: event.fetchImpl });
    expect(event.calls[0].url).toEndWith("/v1/institutions/ORG-1/test-event");
    expect(queued.ok && queued.data.delivery_id).toBe("DLV-1");
  });

  test("a test event without a subscription answers 409", async () => {
    const { fetchImpl } = stub(409, { detail: "no active webhook subscription" });
    const result = await sendTestEvent(config, "tok", "ORG-1", { fetchImpl });
    expect(!result.ok && result.status).toBe(409);
  });

  test("lists the delivery history", async () => {
    const { fetchImpl, calls } = stub(200, [{ delivery_id: "DLV-1", status: "delivered", attempts: [] }]);
    const result = await listDeliveries(config, "tok", "ORG-1", { fetchImpl });
    expect(calls[0].url).toEndWith("/v1/institutions/ORG-1/deliveries");
    expect(result.ok && result.data.length).toBe(1);
  });
});

describe("dashboard formatting", () => {
  test("summarises attempts in order, with the error when there was no HTTP answer", () => {
    expect(
      attemptsSummary([
        { attempt: 3, http_status: 200, error: null, attempted_at: "" },
        { attempt: 1, http_status: 500, error: null, attempted_at: "" },
        { attempt: 2, http_status: 503, error: null, attempted_at: "" },
      ]),
    ).toBe("1: 500, 2: 503, 3: 200");
    expect(attemptsSummary([{ attempt: 1, http_status: null, error: "timeout", attempted_at: "" }])).toBe("1: timeout");
    expect(attemptsSummary([])).toBe("—");
  });

  test("labels delivery statuses", () => {
    expect(DELIVERY_STATUS_LABEL).toEqual({ pending: "Pending", delivered: "Delivered", failed: "Failed" });
  });

  test("reads FastAPI error details", () => {
    expect(errorDetail({ status: 422, body: { detail: "webhook_url must use https" }, error: "HTTP 422" })).toBe(
      "webhook_url must use https",
    );
    expect(errorDetail({ status: 422, body: { detail: [{ msg: "Input should be a valid URL" }] }, error: "HTTP 422" })).toBe(
      "Input should be a valid URL",
    );
    expect(errorDetail({ status: null, body: null, error: "unreachable" })).toBe("unreachable");
  });

  test("optional form fields: trimmed, empty is null", () => {
    expect(optionalField("  3201 ")).toBe("3201");
    expect(optionalField("   ")).toBeNull();
    expect(optionalField(null)).toBeNull();
  });
});
