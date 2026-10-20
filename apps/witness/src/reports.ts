/**
 * The reports this device submitted (SCR-008), newest first, so the reporter can follow them without an account.
 * Only report ids are kept, on the device; each report is read from ingestion, visible to this device only.
 *
 * Earlier builds kept a single id under `agesoa.witness.last-report`; it is migrated into the list on first read
 * and still written, so `lastReportId()` (SCR-006 status card) keeps working with either.
 */

import type { KeyValueStore } from "./auth";
import { defaultStore } from "./auth";

export const LAST_REPORT_KEY = "agesoa.witness.last-report";
export const REPORTS_KEY = "agesoa.witness.reports";
/** Older reports drop off the list; they stay on the service. */
export const MAX_REPORTS = 20;

const VALID_ID = /^[A-Za-z0-9_-]{1,64}$/;

function isReportId(value: unknown): value is string {
  return typeof value === "string" && VALID_ID.test(value);
}

function parseList(raw: string): string[] | null {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(isReportId) : null;
  } catch {
    return null;
  }
}

/** Ids of the reports sent from this device, newest first, at most MAX_REPORTS, tampered entries dropped. */
export function reportIds(store: KeyValueStore = defaultStore()): string[] {
  const raw = store.getItem(REPORTS_KEY);
  const list = raw === null ? null : parseList(raw);
  if (list !== null) return [...new Set(list)].slice(0, MAX_REPORTS);
  const legacy = store.getItem(LAST_REPORT_KEY);
  const migrated = isReportId(legacy) ? [legacy] : [];
  store.setItem(REPORTS_KEY, JSON.stringify(migrated));
  return migrated;
}

export function rememberReport(id: string, store: KeyValueStore = defaultStore()): void {
  if (!isReportId(id)) return;
  const list = [id, ...reportIds(store).filter((existing) => existing !== id)].slice(0, MAX_REPORTS);
  store.setItem(REPORTS_KEY, JSON.stringify(list));
  store.setItem(LAST_REPORT_KEY, id);
}

export function lastReportId(store: KeyValueStore = defaultStore()): string | null {
  return reportIds(store)[0] ?? null;
}

/** The code shown to the reporter; same prefix as the report's entry in the public decision log. */
export function reportCodeOf(id: string): string {
  return `RPT-${id.slice(0, 12)}`;
}
