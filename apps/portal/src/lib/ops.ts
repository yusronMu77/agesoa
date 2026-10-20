/** Operator calls (SCR-090 "Machine" tab): event traffic of every service. Read-only; the token comes from the session. */

import { type PortalConfig, SERVICE_NAMES, type ServiceName } from "./config";
import { type FetchLike, type FetchResult, fetchJson } from "./http";

export interface OpsEvents {
  service: string;
  outbox_pending: number;
  outbox_published: number;
  outbox_failing: number;
  inbox_processed: number;
  by_type: { direction: "out" | "in"; event_type: string; count: number; last_at: string | null }[];
  recent: { direction: "out" | "in"; event_type: string; at: string; status: "published" | "pending" | "failing" | "processed" }[];
}

/** Agents run inside the service of their domain (no agent is a service of its own). */
export const AGENTS: Record<ServiceName, string[]> = {
  ingestion: ["Intake agent", "Privacy guard", "Signal agent"],
  "case-audit": ["Audit agent"],
  trust: ["Role agent", "Quorum rule"],
  delivery: ["Report agent"],
  transparency: ["Decision log writer", "Read model projection"],
};

export async function serviceEvents(
  config: PortalConfig,
  token: string,
): Promise<{ service: ServiceName; result: FetchResult<OpsEvents> }[]> {
  return Promise.all(
    SERVICE_NAMES.map(async (service) => ({
      service,
      result: await fetchJson<OpsEvents>(`${config.serviceUrls[service]}/v1/ops/events`, {
        headers: { authorization: `Bearer ${token}` },
      }),
    })),
  );
}

export interface ResetReport {
  ok: boolean;
  seconds: number;
  steps: { service: string; ok: boolean; detail: string }[];
}

const RESET_FIRST: ServiceName[] = SERVICE_NAMES.filter((s) => s !== "transparency");

/** Demo reset by an operator: the other services together, then transparency (it restarts the log), then the read model. */
export async function resetDemo(
  config: PortalConfig,
  token: string,
  options: { fetchImpl?: FetchLike; now?: () => number } = {},
): Promise<ResetReport> {
  const now = options.now ?? Date.now;
  const started = now();
  const call = async (service: ServiceName, path: string) => {
    const result = await fetchJson<{ tables?: string[] }>(`${config.serviceUrls[service]}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      timeoutMs: 30_000,
      fetchImpl: options.fetchImpl,
    });
    return {
      service: path.includes("read-model") ? "read model" : service,
      ok: result.ok,
      detail: result.ok ? `${result.data.tables?.length ?? 0} tables emptied` : result.error,
    };
  };
  const steps = await Promise.all(RESET_FIRST.map((s) => call(s, "/v1/ops/demo-reset")));
  if (steps.every((s) => s.ok)) steps.push(await call("transparency", "/v1/ops/demo-reset"));
  if (steps.every((s) => s.ok)) {
    const rebuild = await call("transparency", "/v1/ops/read-model/rebuild");
    steps.push({ ...rebuild, detail: rebuild.ok ? "rebuilt from the decision log" : rebuild.detail });
  }
  return { ok: steps.every((s) => s.ok), seconds: Math.round((now() - started) / 100) / 10, steps };
}
