/** Agency admin calls to delivery (SCR-062): webhook subscription, API key, test event, delivery history. */

import type { PortalConfig } from "./config";
import { type FetchLike, type FetchResult, fetchJson } from "./http";

export { errorDetail } from "./http";

export interface Subscription {
  id: string;
  webhook_url: string;
  region_code: string | null;
  category: string | null;
  active: boolean;
  created_at: string;
  /** Delivery paused by the agency: audit reports are held (not sent, not dropped) until resumed. */
  paused?: boolean;
  /** When the current pause started; null when not paused. */
  paused_at?: string | null;
  /** When delivery was last resumed. */
  resumed_at?: string | null;
  /** Deliveries waiting for the resume (status held). */
  held_deliveries?: number;
}

export interface SubscriptionResumed {
  subscription: Subscription;
  /** Delivery ids released, oldest first (sent in this order). */
  released: string[];
}

export interface Institution {
  organization_id: string;
  name: string;
  kind: "newsroom" | "agency";
  synthetic: boolean;
  subscription: Subscription | null;
  api_key: { prefix: string; created_at: string } | null;
}

export interface SubscriptionInput {
  webhook_url: string;
  region_code?: string | null;
  category?: string | null;
}

export interface SubscriptionCreated {
  subscription: Subscription;
  /** HMAC secret, returned only once. */
  secret: string;
}

export interface ApiKeyCreated {
  /** Returned only once; delivery keeps only its hash. */
  api_key: string;
  prefix: string;
  created_at: string;
}

export interface TestEventQueued {
  delivery_id: string;
  event_id: string;
}

export interface DeliveryAttempt {
  attempt: number;
  http_status: number | null;
  error: string | null;
  attempted_at: string;
}

/** `held` = waiting for a paused webhook to resume (no attempt made yet). */
export type DeliveryStatus = "pending" | "delivered" | "failed" | "held";

export interface Delivery {
  delivery_id: string;
  event_id: string;
  event: "audit_report.final" | "test_event";
  case_id: string;
  status: DeliveryStatus;
  /** Set when a pause held the delivery; kept after it is released. */
  held_at?: string | null;
  internal_ticket: string | null;
  created_at: string;
  attempts: DeliveryAttempt[];
}

interface CallOptions {
  fetchImpl?: FetchLike;
}

const base = (config: PortalConfig, id: string) =>
  `${config.serviceUrls.delivery}/v1/institutions/${encodeURIComponent(id)}`;
const bearer = (token: string, options: CallOptions) => ({
  headers: { authorization: `Bearer ${token}` },
  fetchImpl: options.fetchImpl,
});

/** The agency dashboard; 404 when the caller is not the admin of this verified agency. */
export function getInstitution(
  config: PortalConfig,
  token: string,
  id: string,
  options: CallOptions = {},
): Promise<FetchResult<Institution>> {
  return fetchJson(base(config, id), bearer(token, options));
}

export function saveSubscription(
  config: PortalConfig,
  token: string,
  id: string,
  body: SubscriptionInput,
  options: CallOptions = {},
): Promise<FetchResult<SubscriptionCreated>> {
  return fetchJson(`${base(config, id)}/subscription`, { ...bearer(token, options), method: "PUT", body });
}

/** "Jeda webhook" (PRV-pause): new audit reports are held until resumed. Idempotent; 409 without a webhook. */
export function pauseSubscription(
  config: PortalConfig,
  token: string,
  id: string,
  options: CallOptions = {},
): Promise<FetchResult<Subscription>> {
  return fetchJson(`${base(config, id)}/subscription/pause`, { ...bearer(token, options), method: "POST" });
}

/** "Aktifkan kembali" (PRV-paused): held deliveries are sent oldest first. Idempotent; 409 without a webhook. */
export function resumeSubscription(
  config: PortalConfig,
  token: string,
  id: string,
  options: CallOptions = {},
): Promise<FetchResult<SubscriptionResumed>> {
  return fetchJson(`${base(config, id)}/subscription/resume`, { ...bearer(token, options), method: "POST" });
}

export function createApiKey(
  config: PortalConfig,
  token: string,
  id: string,
  options: CallOptions = {},
): Promise<FetchResult<ApiKeyCreated>> {
  return fetchJson(`${base(config, id)}/api-key`, { ...bearer(token, options), method: "POST" });
}

export function sendTestEvent(
  config: PortalConfig,
  token: string,
  id: string,
  options: CallOptions = {},
): Promise<FetchResult<TestEventQueued>> {
  return fetchJson(`${base(config, id)}/test-event`, { ...bearer(token, options), method: "POST" });
}

export function listDeliveries(
  config: PortalConfig,
  token: string,
  id: string,
  options: CallOptions = {},
): Promise<FetchResult<Delivery[]>> {
  return fetchJson(`${base(config, id)}/deliveries`, bearer(token, options));
}

export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  pending: "Pending",
  delivered: "Delivered",
  failed: "Failed",
  held: "Held",
};

export const DELIVERY_EVENT_LABEL: Record<Delivery["event"], string> = {
  "audit_report.final": "Final audit report",
  test_event: "Test event",
};

/** "1: 500, 2: 503, 3: 200" — one entry per attempt, the HTTP status or the error when there was no answer. */
export function attemptsSummary(attempts: DeliveryAttempt[]): string {
  if (attempts.length === 0) return "—";
  return [...attempts]
    .sort((a, b) => a.attempt - b.attempt)
    .map((a) => `${a.attempt}: ${a.http_status ?? a.error ?? "no answer"}`)
    .join(", ");
}

// --- Results of the dashboard server actions (useActionState); one-time values live only here, never in a URL ----

export type ActionError = { ok: false; error: string };
export type WebhookState = null | ActionError | { ok: true; secret: string; webhook_url: string };
export type ApiKeyState = null | ActionError | { ok: true; api_key: string; prefix: string };
export type TestEventState = null | ActionError | { ok: true; delivery_id: string };

/** Optional form text field: trimmed, empty → null. */
export function optionalField(value: FormDataEntryValue | null): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : null;
}
