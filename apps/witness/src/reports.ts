/**
 * The last report this device submitted, so SCR-006 can show its status next to the audit questions. Only the
 * report id is kept, on the device; the report itself is read from ingestion, visible to this device only.
 */

import type { KeyValueStore } from "./auth";
import { defaultStore } from "./auth";

const LAST_REPORT_KEY = "agesoa.witness.last-report";

export function rememberReport(id: string, store: KeyValueStore = defaultStore()): void {
  store.setItem(LAST_REPORT_KEY, id);
}

export function lastReportId(store: KeyValueStore = defaultStore()): string | null {
  const id = store.getItem(LAST_REPORT_KEY);
  return id && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null;
}
