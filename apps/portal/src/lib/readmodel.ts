/**
 * Read-only client for the public read model (Firestore, written only by the transparency service).
 * Uses the Firestore REST API without credentials: the security rules allow anyone to read the public_*
 * collections and nobody to write. The dashboard never reads a service database.
 */

import type { PortalConfig } from "./config";
import { type FetchOptions, type FetchResult, fetchJson } from "./http";

type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { timestampValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

interface FirestoreDocument {
  name: string;
  fields?: Record<string, FirestoreValue>;
}

/** Converts a Firestore REST value into plain JSON. */
export function decodeValue(value: FirestoreValue): unknown {
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("stringValue" in value) return value.stringValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(decodeValue);
  if ("mapValue" in value) return decodeFields(value.mapValue.fields ?? {});
  return null;
}

export function decodeFields(fields: Record<string, FirestoreValue>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

// --- Public documents (field allow-list of services/transparency/read_model.py) ---------------------------

export type EvidenceStatus = "alleged" | "supported" | "proven";

export interface PublicRegion {
  regency_code: string | null;
  regency_name: string;
  district_code: string | null;
  district_name: string | null;
}

export interface PublicCase {
  case_id: string;
  synthetic: boolean;
  domain: string | null;
  category: string | null;
  status: string | null;
  evidence_status: string | null;
  max_finding_status: EvidenceStatus | null;
  region: PublicRegion | null;
  report_count: number;
  signal_count: number;
  updated_at: string | null;
}

export interface PublicFinding {
  finding_id: string;
  synthetic: boolean;
  case_id: string | null;
  domain: string | null;
  statement: string | null;
  status: EvidenceStatus | null;
  evidence_count: number;
  region: PublicRegion | null;
  validation: { outcome: "approved" | "rejected"; completed_at: string; decisions: { tier: string; decision: string }[] } | null;
}

export interface PublicDistrict {
  district_code: string;
  district_name: string;
  regency_code: string;
  regency_name: string;
  /** GeoJSON Polygon / MultiPolygon as JSON text (Firestore has no nested arrays). */
  geometry: string;
  synthetic: boolean;
}

export interface PublicStats {
  cases_by_status: Record<string, number>;
  findings_by_status: Record<string, number>;
  validations_by_outcome: Record<string, number>;
  reports_received: number;
  signals_received: number;
  log_length: number;
  log_head_hash: string;
  updated_at: string;
}

const MAX_PAGES = 10;

/** Lists a public collection (up to MAX_PAGES × 300 documents), oldest page first. */
export async function listCollection<T>(
  config: PortalConfig,
  collection: string,
  options?: FetchOptions,
): Promise<FetchResult<T[]>> {
  const items: T[] = [];
  let pageToken: string | undefined;
  let latency = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams({ pageSize: "300" });
    if (pageToken) query.set("pageToken", pageToken);
    const result = await fetchJson<{ documents?: FirestoreDocument[]; nextPageToken?: string }>(
      `${config.readModelUrl}/${collection}?${query}`,
      options,
    );
    if (!result.ok) return result;
    latency += result.latencyMs;
    items.push(...(result.data.documents ?? []).map((d) => decodeFields(d.fields ?? {}) as T));
    pageToken = result.data.nextPageToken;
    if (!pageToken) break;
  }
  return { ok: true, status: 200, data: items, latencyMs: latency };
}

/** One public document; ok with data null when it does not exist. */
export async function getDocument<T>(
  config: PortalConfig,
  path: string,
  options?: FetchOptions,
): Promise<FetchResult<T | null>> {
  const result = await fetchJson<FirestoreDocument>(`${config.readModelUrl}/${path}`, options);
  if (!result.ok) {
    if (result.status === 404) return { ok: true, status: 404, data: null, latencyMs: result.latencyMs };
    return result;
  }
  return { ...result, data: decodeFields(result.data.fields ?? {}) as T };
}

/** Key that joins a case/finding region to a district boundary: code first, name for codeless (fictional) data. */
export function districtKey(region: { district_code?: string | null; district_name?: string | null } | null): string | null {
  if (!region) return null;
  return region.district_code ?? region.district_name ?? null;
}
