/** Decision-log entries about a case and its findings, merged into one ordered list. */

import type { LogEntry } from "@/services/transparency/transparency.model";

export interface LogDecision {
  actor?: { kind?: string; name?: string };
  reason?: string;
  status_label?: string;
}

/** The `decision` part of a hashed entry (empty when the entry has none). */
export function decisionOf(entry: LogEntry): LogDecision {
  const value = entry.entry as { decision?: Record<string, unknown> } | null;
  return (value?.decision ?? {}) as LogDecision;
}

/** Entries from several subject queries, oldest first, each sequence number once. */
export function mergeEntries(lists: LogEntry[][]): LogEntry[] {
  return lists
    .flat()
    .sort((a, b) => a.seq - b.seq)
    .filter((e, i, all) => i === 0 || all[i - 1].seq !== e.seq);
}
