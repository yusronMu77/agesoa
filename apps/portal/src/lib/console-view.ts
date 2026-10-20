/**
 * Pure view helpers of the signed-in surfaces (validator SCR-020–026, institution SCR-060–065, operator SCR-090).
 * Presentation only: they shape data the services already returned, they never decide anything.
 */

import { formatTime, type Lang } from "./i18n/core";

// --- validator queue (SCR-022) -----------------------------------------------------------------------------------

export type QueueFilter = "waiting" | "evidence" | "decided" | "all";
export const QUEUE_FILTERS: QueueFilter[] = ["waiting", "evidence", "decided", "all"];

export function parseQueueFilter(value: unknown): QueueFilter {
  return typeof value === "string" && (QUEUE_FILTERS as string[]).includes(value) ? (value as QueueFilter) : "waiting";
}

interface QueueItem {
  my_decision?: "approve" | "reject" | "needs_evidence" | null;
  received_at: string;
  deadline_at?: string | null;
  /** Trust: `needs_evidence` while a counted validator asks for more evidence ("Butuh bukti"). */
  state?: string | null;
  evidence_requests?: number;
}

/**
 * Waiting = I have not decided yet (or unknown); evidence = trust says the validation waits for more evidence
 * (`state: needs_evidence`, chip "Butuh bukti"); decided = I gave a decision (approve, reject or needs_evidence).
 */
export function inQueueFilter(item: QueueItem, filter: QueueFilter): boolean {
  if (filter === "all") return true;
  if (filter === "decided") return item.my_decision != null;
  if (filter === "evidence") return item.state === "needs_evidence";
  return item.my_decision == null;
}

const validTime = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const at = new Date(iso).getTime();
  return Number.isNaN(at) ? null : at;
};

/** Past its decision deadline (client side, against `now`). No deadline is never overdue. */
export function isOverdue(item: { deadline_at?: string | null }, now: Date = new Date()): boolean {
  const at = validTime(item.deadline_at);
  return at !== null && at < now.getTime();
}

export interface QueueSummary {
  waiting: number;
  /** Waiting items already past their deadline ("2 melewati tenggat"). */
  overdue: number;
  evidence: number;
  /** Open evidence requests over the evidence items. */
  evidenceRequests: number;
  decided: number;
  approved: number;
  rejected: number;
  total: number;
  /** The waiting item with the nearest deadline (also when it is already overdue); null without deadlines. */
  nearest: { finding_id?: string; deadline_at: string; region?: unknown } | null;
}

export function queueSummary<T extends QueueItem & { finding_id?: string }>(items: T[], now: Date = new Date()): QueueSummary {
  const waiting = items.filter((i) => inQueueFilter(i, "waiting"));
  const evidence = items.filter((i) => inQueueFilter(i, "evidence"));
  const nearest = byDeadline(waiting.filter((i) => validTime(i.deadline_at) !== null))[0];
  return {
    waiting: waiting.length,
    overdue: waiting.filter((i) => isOverdue(i, now)).length,
    evidence: evidence.length,
    evidenceRequests: evidence.reduce((sum, i) => sum + Math.max(1, Number(i.evidence_requests) || 0), 0),
    decided: items.length - waiting.length,
    approved: items.filter((i) => i.my_decision === "approve").length,
    rejected: items.filter((i) => i.my_decision === "reject").length,
    total: items.length,
    nearest: nearest ? { finding_id: nearest.finding_id, deadline_at: nearest.deadline_at as string, region: (nearest as { region?: unknown }).region } : null,
  };
}

/**
 * The order of trust's queue (TXT-VAL-011 "Urut dari tenggat terdekat"): nearest deadline first, requests without a
 * deadline last, the longest waiting first among equals. Does not change the input.
 */
export function byDeadline<T extends { received_at: string; deadline_at?: string | null }>(items: T[]): T[] {
  const key = (i: T) => validTime(i.deadline_at);
  return [...items].sort((a, b) => {
    const da = key(a);
    const db = key(b);
    if (da !== db) {
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    }
    return a.received_at < b.received_at ? -1 : a.received_at > b.received_at ? 1 : 0;
  });
}

/** Calendar day (WIB) of an instant, as a day number, so "besok" means the next date in Indonesia. */
function wibDay(at: number): number {
  return Math.floor((at + 7 * 3_600_000) / 86_400_000);
}

export type DeadlineView =
  | { kind: "none" }
  | { kind: "overdue" }
  | { kind: "today" }
  | { kind: "tomorrow" }
  | { kind: "days"; days: number };

/** How far a decision deadline is, in WIB calendar days: "Lewat tenggat", "Hari ini", "Besok", "{n} hari". */
export function deadlineView(deadline: string | null | undefined, now: Date = new Date()): DeadlineView {
  const at = validTime(deadline);
  if (at === null) return { kind: "none" };
  if (at < now.getTime()) return { kind: "overdue" };
  const days = wibDay(at) - wibDay(now.getTime());
  if (days <= 0) return { kind: "today" };
  if (days === 1) return { kind: "tomorrow" };
  return { kind: "days", days };
}

/** Topbar context of the queue: issue type (domain id) and region name; empty = all. */
export function inQueueContext(item: { domain: string }, context: { domain: string; region: string }): boolean {
  if (context.domain && item.domain !== context.domain) return false;
  if (context.region && regionName(item) !== context.region) return false;
  return true;
}

/** Regency of a validation request (trust returns `region` although the portal type does not declare it). */
export function regionName(item: unknown): string | null {
  const region = (item as { region?: { regency_name?: unknown; district_name?: unknown } | null } | null)?.region;
  if (!region) return null;
  const parts = [region.district_name, region.regency_name].filter((p): p is string => typeof p === "string" && p !== "");
  return parts.length ? parts.join(", ") : null;
}

/** The narrowest region name (district, else regency) for a table cell; the full name goes in its title. */
export function shortRegion(item: unknown): string | null {
  const region = (item as { region?: { regency_name?: unknown; district_name?: unknown } | null } | null)?.region;
  if (!region) return null;
  for (const part of [region.district_name, region.regency_name]) if (typeof part === "string" && part !== "") return part;
  return null;
}

// --- decision (SCR-020) -------------------------------------------------------------------------------------------

export type DecisionValue = "approve" | "reject" | "needs_evidence";

/**
 * The decisions a validator can still give (trust `may_decide`): all three before deciding; after asking for more
 * evidence only approve or reject (replacing it once); none after approve/reject or once the validation closed.
 */
export function decisionChoices(myDecision: DecisionValue | null | undefined, closed: boolean): DecisionValue[] {
  if (closed) return [];
  if (myDecision == null) return ["approve", "reject", "needs_evidence"];
  if (myDecision === "needs_evidence") return ["approve", "reject"];
  return [];
}

/** The decision posted from the form; anything unknown is refused (null) rather than guessed. */
export function parseDecision(value: unknown): DecisionValue | null {
  return value === "approve" || value === "reject" || value === "needs_evidence" ? value : null;
}

/** "Tingkat keyakinan" options → trust `confidence` (0..1); empty or unknown → null (not stated). */
export const CONFIDENCE_LEVELS = { high: 0.9, medium: 0.7, low: 0.5 } as const;

export function parseConfidence(value: unknown): number | null {
  return typeof value === "string" && value in CONFIDENCE_LEVELS ? CONFIDENCE_LEVELS[value as keyof typeof CONFIDENCE_LEVELS] : null;
}

/**
 * The e-mail address in the session token, for display only ("Email admin" = the signed-in account). The portal
 * never trusts it for access: the services verify the token themselves.
 */
export function tokenEmail(token: string | null | undefined): string | null {
  const payload = token?.split(".")[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as { email?: unknown };
    return typeof json.email === "string" && json.email.includes("@") ? json.email : null;
  } catch {
    return null;
  }
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

/** The reading fields the review shows; no name or position of the person. */
export interface ReadingSummary {
  issuer: string | null;
  number: string | null;
  valid_until: string | null;
  confidence: number;
}

const textOrNull = (value: unknown) => (typeof value === "string" && value !== "" ? value : null);

/** The reading summary from the cookie value; null when missing or malformed. */
export function parseReading(raw: string | undefined | null): ReadingSummary | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const confidence = Number(data.confidence);
    if (!Number.isFinite(confidence)) return null;
    return {
      issuer: textOrNull(data.issuer),
      number: textOrNull(data.number),
      valid_until: textOrNull(data.valid_until),
      confidence: Math.min(1, Math.max(0, confidence)),
    };
  } catch {
    return null;
  }
}

export type RegistrationView = { kind: "form"; step: 0 | 1 } | { kind: "review" } | { kind: "status" };

/**
 * Which registration view to show: the form (step 1 role/region or step 2 documents) when there is no
 * application yet or a rejected one is corrected, the reading review right after Agen Peran read the documents,
 * otherwise the status of the application.
 */
export function registrationView(input: { status: string | null; step: string; retry: boolean; hasReading: boolean }): RegistrationView {
  if (input.status === null || (input.status === "rejected" && input.retry)) {
    return { kind: "form", step: input.step === "documents" ? 1 : 0 };
  }
  if (input.step === "review" && input.hasReading) return { kind: "review" };
  return { kind: "status" };
}

/** Organization steps (SCR-060 → 064 → 065): data, DNS TXT, status. */
export function organizationSteps(status: "awaiting_dns" | "verified" | "rejected"): StepState[] {
  if (status === "awaiting_dns") return ["done", "current", "next"];
  return ["done", "done", "current"];
}

// --- organization registration form (SCR-060) ----------------------------------------------------------------

export interface OrganizationFormValues {
  name: string;
  kind: "newsroom" | "agency";
  domain: string;
  regency: string;
  contact_email: string;
  authority: boolean;
}

export type OrganizationField = "name" | "domain" | "regency" | "contact_email" | "authority";

/** Result of "Lanjut ke DNS": entries kept, one message per field, or a form-level error (network). */
export type OrganizationFormState = null | {
  values: OrganizationFormValues;
  errors: Partial<Record<OrganizationField, string>>;
  formError: string | null;
};

type OrgErrorKey = "org.error.name" | "org.domainHint" | "org.error.regency" | "org.error.email" | "org.error.authority";

const DOMAIN_RE = /^([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}\.?$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Checks the SCR-060 form before trust does (same rules as trust's OrganizationIn): a bare host name for the domain
 * (TXT-REG-057 "Isi domain tanpa https:// atau path."), one optional contact e-mail, the authority declaration
 * (TXT-REG-081, never pre-ticked). Returns message keys, so the action translates them.
 */
export function checkOrganizationForm(
  form: FormData,
): { ok: true; values: OrganizationFormValues } | { ok: false; values: OrganizationFormValues; errors: Partial<Record<OrganizationField, OrgErrorKey>> } {
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const values: OrganizationFormValues = {
    name: text("name"),
    kind: form.get("kind") === "newsroom" ? "newsroom" : "agency",
    domain: text("domain"),
    regency: text("regency"),
    contact_email: text("contact_email"),
    authority: form.get("authority") === "on",
  };
  const errors: Partial<Record<OrganizationField, OrgErrorKey>> = {};
  if (values.name.length < 2) errors.name = "org.error.name";
  if (!DOMAIN_RE.test(values.domain)) errors.domain = "org.domainHint";
  if (values.regency.length < 2) errors.regency = "org.error.regency";
  if (values.contact_email && !EMAIL_RE.test(values.contact_email)) errors.contact_email = "org.error.email";
  if (!values.authority) errors.authority = "org.error.authority";
  return Object.keys(errors).length > 0 ? { ok: false, values, errors } : { ok: true, values };
}

export type OrganizationView = "dns" | "status" | "dashboard";

/**
 * What the organization page shows: the TXT step (SCR-064, also after a DNS error), the outcome of a check or a
 * rejection (SCR-065, full page), or the console dashboard of a verified organization (SCR-061/062).
 */
export function organizationView(status: "awaiting_dns" | "verified" | "rejected", check: string | null): OrganizationView {
  if (status === "rejected") return "status";
  if (status === "verified") return check === "verified" || check === "already_verified" ? "status" : "dashboard";
  return check === "no_record" || check === "token_mismatch" ? "status" : "dns";
}

/** The newest deliveries first, at most `limit` of them (SCR-062 shows four, "Lihat semua" the rest). */
export function latestFirst<T extends { created_at: string }>(items: T[], limit?: number): T[] {
  const sorted = [...items].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  return limit === undefined ? sorted : sorted.slice(0, limit);
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

/** Clock time in Western Indonesia Time (the shared i18n formatter): `10.42 WIB`, `10.42.07 WIB` / `10:42 AM WIB`. */
export function formatClock(lang: Lang, iso: string | null | undefined, seconds = false): string {
  return formatTime(lang, iso, seconds);
}
