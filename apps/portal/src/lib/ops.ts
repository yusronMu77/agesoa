/** Operator calls (SCR-090 "Machine" tab): event traffic of every service. Read-only; the token comes from the session. */

import { type PortalConfig, SERVICE_NAMES, type ServiceName } from "./config";
import { type FetchResult, fetchJson } from "./http";

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
