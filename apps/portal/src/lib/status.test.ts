import { describe, expect, test } from "bun:test";
import { loadConfig } from "./config";
import type { FetchLike } from "./http";
import { getStatusReport, overallState } from "./status";

const config = loadConfig({ RELEASE: "test" });

function readyz(service: string, status: "ready" | "not_ready", dbOk = true) {
  return {
    service,
    status,
    release: "dev",
    environment: "local",
    demo_mode: false,
    database: { ok: dbOk, name: service.replace("-", "_"), user: service, error: dbOk ? null : "connection refused" },
    outbox_pending: 3,
    details: {},
  };
}

/** Routes each request by port to a canned behaviour. */
function mockFetch(byPort: Record<string, (init?: RequestInit) => Promise<Response>>): { fetchImpl: FetchLike; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl: FetchLike = (input, init) => {
    calls.push(input);
    const port = new URL(input).port;
    const handler = byPort[port];
    if (!handler) return Promise.reject(new TypeError("fetch failed"));
    return handler(init);
  };
  return { fetchImpl, calls };
}

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

describe("getStatusReport", () => {
  test("reports every service ready", async () => {
    const { fetchImpl, calls } = mockFetch({
      "8001": () => json(readyz("ingestion", "ready")),
      "8002": () => json(readyz("case-audit", "ready")),
      "8003": () => json(readyz("trust", "ready")),
      "8004": () => json(readyz("delivery", "ready")),
      "8005": () => json(readyz("transparency", "ready")),
    });
    const report = await getStatusReport(config, { fetchImpl, now: () => new Date("2026-10-13T00:00:00Z") });

    expect(calls.sort()).toEqual([
      "http://localhost:8001/readyz",
      "http://localhost:8002/readyz",
      "http://localhost:8003/readyz",
      "http://localhost:8004/readyz",
      "http://localhost:8005/readyz",
    ]);
    expect(report.overall).toBe("ok");
    expect(report.checked_at).toBe("2026-10-13T00:00:00.000Z");
    expect(report.portal).toEqual({ release: "test", environment: "local", demo_mode: false });
    expect(report.services.map((s) => s.service)).toEqual(["ingestion", "case-audit", "trust", "delivery", "transparency"]);
    const caseAudit = report.services[1];
    expect(caseAudit.state).toBe("ready");
    expect(caseAudit.http_status).toBe(200);
    expect(caseAudit.database).toEqual({ ok: true, name: "case_audit" });
    expect(caseAudit.outbox_pending).toBe(3);
    expect(caseAudit.error).toBeNull();
  });

  test("distinguishes not ready (503 with body) from down (unreachable, timeout, non-JSON)", async () => {
    const { fetchImpl } = mockFetch({
      "8001": () => json(readyz("ingestion", "ready")),
      "8002": () => json(readyz("case-audit", "not_ready", false), 503),
      // 8003 missing: connection refused
      // never answers; like real fetch, rejects when the timeout signal aborts
      "8004": (init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
      "8005": () => Promise.resolve(new Response("<html>bad gateway</html>", { status: 502 })),
    });
    const report = await getStatusReport(config, { fetchImpl, timeoutMs: 50 });
    const byName = Object.fromEntries(report.services.map((s) => [s.service, s]));

    expect(report.overall).toBe("degraded");
    expect(byName.ingestion.state).toBe("ready");
    expect(byName["case-audit"]).toMatchObject({
      state: "not_ready",
      http_status: 503,
      database: { ok: false, name: "case_audit" },
      error: "database unavailable",
    });
    expect(byName.trust).toMatchObject({ state: "down", http_status: null, error: "unreachable" });
    expect(byName.delivery).toMatchObject({ state: "down", http_status: null, error: "timeout after 50 ms" });
    expect(byName.transparency).toMatchObject({ state: "down", http_status: 502, error: "HTTP 502" });
  });

  test("checks services in parallel", async () => {
    const delay = (ms: number) => new Promise<Response>((r) => setTimeout(() => r(new Response("{}")), ms));
    const fetchImpl: FetchLike = () => delay(100).then(() => new Response(JSON.stringify(readyz("x", "ready"))));
    const started = performance.now();
    const report = await getStatusReport(config, { fetchImpl });
    expect(report.overall).toBe("ok");
    expect(performance.now() - started).toBeLessThan(400);
  });

  test("is down when every service is down", async () => {
    const fetchImpl: FetchLike = () => Promise.reject(new TypeError("fetch failed"));
    const report = await getStatusReport(config, { fetchImpl });
    expect(report.overall).toBe("down");
    expect(report.services.every((s) => s.state === "down")).toBe(true);
  });
});

describe("overallState", () => {
  test("is degraded when at least one service is not ready but not all are down", () => {
    const base = { http_status: 200, release: null, environment: null, demo_mode: null, database: { ok: null, name: null }, outbox_pending: null, latency_ms: 1, error: null };
    expect(
      overallState([
        { ...base, service: "ingestion", state: "ready" },
        { ...base, service: "trust", state: "not_ready" },
      ]),
    ).toBe("degraded");
  });
});
