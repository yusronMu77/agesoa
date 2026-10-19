/** Aggregates the readiness of the five backend services for /status and /api/status. */

import { type PortalConfig, SERVICE_NAMES, type ServiceName } from "@/configs/env.config";
import { DEFAULT_TIMEOUT_MS, type FetchLike, fetchJson } from "@/services/http/fetch-json";

export type ServiceState = "ready" | "not_ready" | "down";
export type OverallState = "ok" | "degraded" | "down";

/** Body of GET /readyz on every service. */
interface ReadyzBody {
  service?: string;
  status?: string;
  release?: string;
  environment?: string;
  demo_mode?: boolean;
  database?: { ok?: boolean; name?: string; user?: string; error?: string | null };
  outbox_pending?: number;
}

export interface ServiceStatus {
  service: ServiceName;
  state: ServiceState;
  http_status: number | null;
  release: string | null;
  environment: string | null;
  demo_mode: boolean | null;
  database: { ok: boolean | null; name: string | null };
  outbox_pending: number | null;
  latency_ms: number;
  error: string | null;
}

export interface StatusReport {
  checked_at: string;
  overall: OverallState;
  portal: { release: string; environment: string; demo_mode: boolean };
  services: ServiceStatus[];
}

export interface StatusOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  now?: () => Date;
}

function isReadyzBody(value: unknown): value is ReadyzBody {
  return typeof value === "object" && value !== null && "status" in value;
}

const str = (value: unknown) => (typeof value === "string" ? value : null);
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const bool = (value: unknown) => (typeof value === "boolean" ? value : null);

export async function checkService(
  service: ServiceName,
  baseUrl: string,
  options: StatusOptions = {},
): Promise<ServiceStatus> {
  const result = await fetchJson<ReadyzBody>(`${baseUrl}/readyz`, {
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });
  const body = result.ok ? result.data : result.body;

  if (!isReadyzBody(body)) {
    return {
      service,
      state: "down",
      http_status: result.status,
      release: null,
      environment: null,
      demo_mode: null,
      database: { ok: null, name: null },
      outbox_pending: null,
      latency_ms: result.latencyMs,
      error: result.ok ? "unexpected response" : result.error,
    };
  }

  // A JSON answer means the service is up; 503 or status != "ready" means it is not ready.
  const ready = result.ok && body.status === "ready";
  return {
    service,
    state: ready ? "ready" : "not_ready",
    http_status: result.status,
    release: str(body.release),
    environment: str(body.environment),
    demo_mode: bool(body.demo_mode),
    database: { ok: bool(body.database?.ok), name: str(body.database?.name) },
    outbox_pending: num(body.outbox_pending),
    latency_ms: result.latencyMs,
    error: ready ? null : body.database?.ok === false ? "database unavailable" : "not ready",
  };
}

export function overallState(services: ServiceStatus[]): OverallState {
  if (services.every((s) => s.state === "ready")) return "ok";
  if (services.every((s) => s.state === "down")) return "down";
  return "degraded";
}

/** Calls /readyz on all services in parallel (each with its own timeout). */
export async function getStatusReport(config: PortalConfig, options: StatusOptions = {}): Promise<StatusReport> {
  const now = options.now ?? (() => new Date());
  const services = await Promise.all(
    SERVICE_NAMES.map((service) => checkService(service, config.serviceUrls[service], options)),
  );
  return {
    checked_at: now().toISOString(),
    overall: overallState(services),
    portal: { release: config.release, environment: config.appEnv, demo_mode: config.demoMode },
    services,
  };
}
