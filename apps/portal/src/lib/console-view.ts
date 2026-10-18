/**
 * Pure view helpers of the signed-in surfaces (validator SCR-020–026, institution SCR-060–065, operator SCR-090).
 * Presentation only: they shape data the services already returned, they never decide anything.
 */

import type { Lang } from "./i18n/core";

// --- validator queue (SCR-022) -----------------------------------------------------------------------------------

export type QueueFilter = "waiting" | "decided" | "all";
export const QUEUE_FILTERS: QueueFilter[] = ["waiting", "decided", "all"];

export function parseQueueFilter(value: unknown): QueueFilter {
  return typeof value === "string" && (QUEUE_FILTERS as string[]).includes(value) ? (value as QueueFilter) : "waiting";
}

interface QueueItem {
  my_decision?: "approve" | "reject" | null;
  received_at: string;
}

/** Waiting = not decided by me yet (or unknown); decided = I decided, the quorum is still open. */
export function inQueueFilter(item: QueueItem, filter: QueueFilter): boolean {
  if (filter === "all") return true;
  const decided = item.my_decision === "approve" || item.my_decision === "reject";
  return filter === "decided" ? decided : !decided;
}

export interface QueueSummary {
  waiting: number;
  decided: number;
  total: number;
  oldestWaiting: string | null;
}

export function queueSummary(items: QueueItem[]): QueueSummary {
  const waiting = items.filter((i) => inQueueFilter(i, "waiting"));
  const oldest = waiting
    .map((i) => i.received_at)
    .filter((at) => !Number.isNaN(new Date(at).getTime()))
    .sort()[0];
  return { waiting: waiting.length, decided: items.length - waiting.length, total: items.length, oldestWaiting: oldest ?? null };
}

/** Regency of a validation request (trust returns `region` although the portal type does not declare it). */
export function regionName(item: unknown): string | null {
  const region = (item as { region?: { regency_name?: unknown; district_name?: unknown } | null } | null)?.region;
  if (!region) return null;
  const parts = [region.district_name, region.regency_name].filter((p): p is string => typeof p === "string" && p !== "");
  return parts.length ? parts.join(", ") : null;
}

// --- audit trail (SCR-020) ---------------------------------------------------------------------------------------

/** `{en, id}` objects from the domain pack, plain strings, or anything else (→ null). */
export function localized(value: unknown, lang: Lang): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const text = record[lang] ?? record.id ?? record.en;
    return typeof text === "string" ? text : null;
  }
  return null;
}

const TITLE_KEYS = ["label", "text", "statement", "summary", "title", "question"];
const HIDDEN_KEYS = new Set([...TITLE_KEYS, "question_id", "key"]);

export interface StepView {
  title: string | null;
  facts: { key: string; value: string }[];
}

/** A readable summary of one audit step: its title (localized) and its short scalar facts; nested data is skipped. */
export function auditStepView(content: Record<string, unknown>, lang: Lang): StepView {
  let title: string | null = null;
  for (const key of TITLE_KEYS) {
    title = localized(content[key], lang);
    if (title) break;
  }
  const facts: { key: string; value: string }[] = [];
  for (const [key, value] of Object.entries(content)) {
    if (HIDDEN_KEYS.has(key)) continue;
    if (typeof value === "number") facts.push({ key, value: Number.isInteger(value) ? String(value) : value.toFixed(2) });
    else if (typeof value === "string" && value.length <= 120) facts.push({ key, value });
    else if (typeof value === "boolean") facts.push({ key, value: String(value) });
    else if (Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === "string")) {
      facts.push({ key, value: (value as string[]).join(", ") });
    }
  }
  return { title, facts };
}

/** Steps written by a person are not AI results; everything the audit pipeline wrote is. */
export function isMachineActor(actor: string): boolean {
  return !/validator|human|operator|admin/i.test(actor);
}

// --- registration steps (SCR-021, 024–026) -----------------------------------------------------------------------

export type StepState = "done" | "current" | "next";

/**
 * The four steps of the validator registration as the current flow runs them: role/region and the document are
 * sent together in one form; Agen Peran reads the document on submit; then the status (a rejected registration
 * stays on the status step, with the form below it to send again).
 */
export function registrationSteps(status: string | null): StepState[] {
  if (status === null) return ["current", "current", "next", "next"];
  return ["done", "done", "done", "current"];
}

/** Organization steps (SCR-060 → 064 → 065): data, DNS TXT, status. */
export function organizationSteps(status: "awaiting_dns" | "verified" | "rejected"): StepState[] {
  if (status === "awaiting_dns") return ["done", "current", "next"];
  return ["done", "done", "current"];
}

// --- operator (SCR-090) ------------------------------------------------------------------------------------------

interface OpsCounts {
  outbox_published: number;
  outbox_pending: number;
  outbox_failing: number;
  inbox_processed: number;
  recent?: { direction: "out" | "in"; event_type: string; at: string; status: string }[];
}

export function opsTotals(results: (OpsCounts | null)[]) {
  const ok = results.filter((r): r is OpsCounts => r !== null);
  const sum = (key: keyof Omit<OpsCounts, "recent">) => ok.reduce((total, r) => total + (Number(r[key]) || 0), 0);
  return {
    reporting: ok.length,
    published: sum("outbox_published"),
    pending: sum("outbox_pending"),
    failing: sum("outbox_failing"),
    processed: sum("inbox_processed"),
  };
}

export interface RecentEvent {
  service: string;
  direction: "out" | "in";
  event_type: string;
  at: string;
  status: string;
}

/** The newest events of all services together, newest first. */
export function recentEvents(results: { service: string; data: OpsCounts | null }[], limit = 8): RecentEvent[] {
  return results
    .flatMap(({ service, data }) => (data?.recent ?? []).map((e) => ({ service, ...e })))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, limit);
}
