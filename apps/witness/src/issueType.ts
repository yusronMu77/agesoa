/**
 * The issue type (domain pack) the reporter last chose on SCR-001, remembered on this device only so a regular
 * reporter does not pick it again. Only a pack id is stored, never anything about the report.
 */

import type { KeyValueStore } from "./auth";
import { defaultStore } from "./auth";

export const ISSUE_TYPE_KEY = "agesoa.witness.issue-type";

/** The saved issue type when it is a well-formed pack id, else null (the configured default applies). */
export function savedIssueType(store: KeyValueStore = defaultStore()): string | null {
  const value = store.getItem(ISSUE_TYPE_KEY);
  return value && /^[a-z][a-z0-9_]{0,47}$/.test(value) ? value : null;
}

export function saveIssueType(id: string, store: KeyValueStore = defaultStore()): void {
  store.setItem(ISSUE_TYPE_KEY, id);
}
