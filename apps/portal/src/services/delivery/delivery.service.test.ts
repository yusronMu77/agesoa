import { describe, expect, test } from "bun:test";
import { loadConfig } from "@/configs/env.config";
import { createBackend } from "@/services/backend";

const config = loadConfig({});

function stub(status: number, body: unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  };
  return { delivery: createBackend(config, { token: "tok", fetchImpl }).delivery, calls };
}

const header = (init: RequestInit | undefined, name: string) => (init?.headers as Record<string, string>)[name];

describe("agency dashboard calls to delivery", () => {
  test("reads the institution with the session token", async () => {
    const { delivery, calls } = stub(200, { organization_id: "ORG-1", subscription: null, api_key: null });
    const result = await delivery.getInstitution("ORG 1");
    expect(result.ok).toBe(true);
    expect(calls[0].url).toBe("http://localhost:8004/v1/institutions/ORG%201");
    expect(calls[0].init?.method).toBe("GET");
    expect(header(calls[0].init, "authorization")).toBe("Bearer tok");
  });

  test("a 404 (not the admin of a verified agency) is returned, not thrown", async () => {
    const { delivery } = stub(404, { detail: "institution not found" });
    const result = await delivery.getInstitution("ORG-1");
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });

  test("saves the webhook with PUT and returns the one-time secret", async () => {
    const { delivery, calls } = stub(200, { subscription: { id: "SUB-1", webhook_url: "https://x.test/h" }, secret: "whsec_abc" });
    const result = await delivery.saveSubscription("ORG-1", { webhook_url: "https://x.test/h", region_code: null, category: "mbg" });
    expect(calls[0].url).toEndWith(":8004/v1/institutions/ORG-1/subscription");
    expect(calls[0].init?.method).toBe("PUT");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ webhook_url: "https://x.test/h", region_code: null, category: "mbg" });
    expect(result.ok && result.data.secret).toBe("whsec_abc");
  });

  test("creates an API key and queues a test event with POST", async () => {
    const key = stub(201, { api_key: "agk_secret", prefix: "agk_secret", created_at: "2026-10-16T00:00:00Z" });
    const created = await key.delivery.createApiKey("ORG-1");
    expect(key.calls[0].url).toEndWith("/v1/institutions/ORG-1/api-key");
    expect(key.calls[0].init?.method).toBe("POST");
    expect(created.ok && created.status).toBe(201);

    const event = stub(202, { delivery_id: "DLV-1", event_id: "EVT-1" });
    const queued = await event.delivery.sendTestEvent("ORG-1");
    expect(event.calls[0].url).toEndWith("/v1/institutions/ORG-1/test-event");
    expect(queued.ok && queued.data.delivery_id).toBe("DLV-1");
  });

  test("a test event without a subscription answers 409", async () => {
    const { delivery } = stub(409, { detail: "no active webhook subscription" });
    const result = await delivery.sendTestEvent("ORG-1");
    expect(!result.ok && result.status).toBe(409);
  });

  test("lists the delivery history", async () => {
    const { delivery, calls } = stub(200, [{ delivery_id: "DLV-1", status: "delivered", attempts: [] }]);
    const result = await delivery.listDeliveries("ORG-1");
    expect(calls[0].url).toEndWith("/v1/institutions/ORG-1/deliveries");
    expect(result.ok && result.data.length).toBe(1);
  });
});
