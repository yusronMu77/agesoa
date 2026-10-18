/**
 * The reports this device submitted, newest first, so SCR-008 can list them and SCR-006 can show the status of the
 * last one. Only the report ids are kept, on the device; a report itself is read from ingestion, visible to this
 * device only.
 */

import type { KeyValueStore } from "./auth";
import { defaultStore } from "./auth";

const REPORTS_KEY = "agesoa.witness.reports";
const LAST_REPORT_KEY = "agesoa.witness.last-report";
const MAX_REPORTS = 20;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function reportIds(store: KeyValueStore = defaultStore()): string[] {
  let list: unknown = [];
  try {
    list = JSON.parse(store.getItem(REPORTS_KEY) ?? "[]");
  } catch {
    list = [];
  }
  const ids = Array.isArray(list) ? list.filter((id): id is string => typeof id === "string" && ID.test(id)) : [];
  const last = store.getItem(LAST_REPORT_KEY); // kept by earlier versions
  return last && ID.test(last) && !ids.includes(last) ? [last, ...ids] : ids;
}

export function rememberReport(id: string, store: KeyValueStore = defaultStore()): void {
  const ids = [id, ...reportIds(store).filter((known) => known !== id)].slice(0, MAX_REPORTS);
  store.setItem(REPORTS_KEY, JSON.stringify(ids));
  store.setItem(LAST_REPORT_KEY, id);
}

export function lastReportId(store: KeyValueStore = defaultStore()): string | null {
  return reportIds(store)[0] ?? null;
}
