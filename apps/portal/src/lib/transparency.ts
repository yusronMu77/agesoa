/** Read-only client for the public decision log served by the transparency service. */

import type { PortalConfig } from "./config";
import { type FetchOptions, type FetchResult, fetchJson } from "./http";

export interface LogEntry {
  seq: number;
  event_id: string;
  decision_id: string;
  source_service: string;
  action: string;
  subject_kind: string;
  subject_id: string;
  entry: unknown;
  prev_hash: string;
  hash: string;
  recorded_at: string;
}

export interface LogPage {
  items: LogEntry[];
  next_after: number | null;
}

export interface LogHead {
  seq: number;
  hash: string;
  updated_at: string;
}

export interface LogVerification {
  ok: boolean;
  length: number;
  head_hash: string | null;
  first_invalid_seq: number | null;
  reason: string | null;
}

/** Page size used by the portal; the service accepts up to 200. */
export const LOG_PAGE_SIZE = 50;

const base = (config: PortalConfig) => `${config.serviceUrls.transparency}/v1/log`;

export function getLogPage(
  config: PortalConfig,
  params: { after?: number; limit?: number } = {},
  options?: FetchOptions,
): Promise<FetchResult<LogPage>> {
  const query = new URLSearchParams({ limit: String(params.limit ?? LOG_PAGE_SIZE) });
  if (params.after !== undefined && params.after > 0) query.set("after", String(params.after));
  return fetchJson<LogPage>(`${base(config)}?${query}`, options);
}

export function getLogHead(config: PortalConfig, options?: FetchOptions): Promise<FetchResult<LogHead>> {
  return fetchJson<LogHead>(`${base(config)}/head`, options);
}

export function verifyLog(config: PortalConfig, options?: FetchOptions): Promise<FetchResult<LogVerification>> {
  return fetchJson<LogVerification>(`${base(config)}/verify`, options);
}

export function getLogEntry(config: PortalConfig, seq: number, options?: FetchOptions): Promise<FetchResult<LogEntry>> {
  return fetchJson<LogEntry>(`${base(config)}/${seq}`, options);
}

/** Parses a non-negative integer from a query/route parameter; undefined when invalid. */
export function parseSeq(raw: string | string[] | undefined): number | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || !/^\d{1,15}$/.test(value)) return undefined;
  return Number(value);
}

/** Every log entry about one subject (e.g. a case or a finding), oldest first. */
export async function getLogForSubject(
  config: PortalConfig,
  subjectKind: string,
  subjectId: string,
  options?: FetchOptions,
): Promise<FetchResult<LogEntry[]>> {
  const items: LogEntry[] = [];
  let after = 0;
  let latency = 0;
  for (let page = 0; page < 20; page++) {
    const query = new URLSearchParams({ subject_kind: subjectKind, subject_id: subjectId, limit: "200" });
    if (after > 0) query.set("after", String(after));
    const result = await fetchJson<LogPage>(`${base(config)}?${query}`, options);
    if (!result.ok) return result;
    latency += result.latencyMs;
    items.push(...result.data.items);
    if (result.data.next_after === null) break;
    after = result.data.next_after;
  }
  return { ok: true, status: 200, data: items, latencyMs: latency };
}
