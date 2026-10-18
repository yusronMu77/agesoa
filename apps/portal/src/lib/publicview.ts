/**
 * Pure helpers of the public dashboard (SCR-040–043): district aggregation, honest rankings computed from the read
 * model, the heat-map legend, evidence filters and how a decision log entry is presented. No I/O, so they are unit
 * tested and run the same on the server and in tests.
 */

import type { EvidenceStatus, PublicCase, PublicDistrict, PublicFinding } from "./readmodel";
import { districtKey } from "./readmodel";
import type { LocalizedText } from "./localized";
import type { LogEntry, LogVerification } from "./transparency";

export const EVIDENCE_STATUSES: EvidenceStatus[] = ["alleged", "supported", "proven"];

/** `?status=` of the findings filter: one evidence status, or null for "all". */
export function parseEvidenceFilter(raw: string | string[] | undefined): EvidenceStatus | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return EVIDENCE_STATUSES.find((s) => s === value) ?? null;
}

export function countByEvidence(findings: Pick<PublicFinding, "status">[]): Record<EvidenceStatus, number> {
  const counts: Record<EvidenceStatus, number> = { alleged: 0, supported: 0, proven: 0 };
  for (const f of findings) if (f.status) counts[f.status] += 1;
  return counts;
}

/** Cases the audit still works on (open or under investigation). */
export function isActiveCase(c: Pick<PublicCase, "status">): boolean {
  return c.status === "open" || c.status === "investigating";
}

/** Name of the smallest area a case is placed in (district, else regency), for "in N areas". */
export function areaName(region: PublicCase["region"]): string | null {
  return region?.district_name ?? region?.regency_name ?? null;
}

export function distinctAreas(cases: Pick<PublicCase, "region">[]): number {
  return new Set(cases.map((c) => areaName(c.region)).filter((a): a is string => a !== null)).size;
}

export interface DistrictCounts {
  /** Cases drawn on each district, by district_code. */
  perDistrict: Map<string, number>;
  /** Cases without a matching district boundary (or synthetic vs real mismatch). */
  unmapped: PublicCase[];
  max: number;
}

/**
 * Cases per district boundary. A case is drawn on a district only when both are synthetic or both are real: synthetic
 * (demo) cases never appear on a real regency, and real cases never on the fictional one.
 */
export function casesPerDistrict(cases: PublicCase[], districts: PublicDistrict[]): DistrictCounts {
  const byKey = new Map<string, PublicDistrict>();
  for (const d of districts) {
    byKey.set(d.district_code, d);
    byKey.set(d.district_name, d);
  }
  const perDistrict = new Map<string, number>();
  const unmapped: PublicCase[] = [];
  for (const c of cases) {
    const key = districtKey(c.region);
    const district = key
      ? (byKey.get(key) ?? (c.region?.district_name ? byKey.get(c.region.district_name) : undefined))
      : undefined;
    if (district && district.synthetic === c.synthetic) {
      perDistrict.set(district.district_code, (perDistrict.get(district.district_code) ?? 0) + 1);
    } else {
      unmapped.push(c);
    }
  }
  return { perDistrict, unmapped, max: Math.max(0, ...perDistrict.values()) };
}

/** Districts ordered by case count (most first, then by name); districts without a case are left out. */
export function rankDistricts(
  districts: PublicDistrict[],
  perDistrict: Map<string, number>,
  limit = 3,
): { district: PublicDistrict; cases: number }[] {
  return districts
    .map((district) => ({ district, cases: perDistrict.get(district.district_code) ?? 0 }))
    .filter((d) => d.cases > 0)
    .sort((a, b) => b.cases - a.cases || a.district.district_name.localeCompare(b.district.district_name))
    .slice(0, limit);
}

export interface RankedCase {
  rank: number;
  case: PublicCase;
  /** The case's findings, as the read model publishes them. */
  findings: PublicFinding[];
  /** Text to show as the card title: audit report summary, else the first finding statement, else null. */
  title: string | null;
  /** The same title per language when the producer wrote it. */
  title_i18n: LocalizedText | null;
}

/**
 * The most reported cases (citizen reports, then public signals, then the latest update). The ranking is computed
 * from totals in the read model: it is not a 7-day trend, which the read model does not publish.
 */
export function rankMostReported(cases: PublicCase[], findings: PublicFinding[], limit = 3): RankedCase[] {
  const byCase = new Map<string, PublicFinding[]>();
  for (const f of findings) {
    if (!f.case_id) continue;
    byCase.set(f.case_id, [...(byCase.get(f.case_id) ?? []), f]);
  }
  return cases
    .filter((c) => c.report_count + c.signal_count > 0)
    .sort(
      (a, b) =>
        b.report_count - a.report_count ||
        b.signal_count - a.signal_count ||
        (b.updated_at ?? "").localeCompare(a.updated_at ?? "") ||
        a.case_id.localeCompare(b.case_id),
    )
    .slice(0, limit)
    .map((c, i) => {
      const caseFindings = byCase.get(c.case_id) ?? [];
      return {
        rank: i + 1,
        case: c,
        findings: caseFindings,
        title: c.audit_report?.summary ?? caseFindings.find((f) => f.statement)?.statement ?? null,
        title_i18n: c.audit_report?.summary
          ? (c.audit_report.summary_i18n ?? null)
          : (caseFindings.find((f) => f.statement)?.statement_i18n ?? null),
      };
    });
}

export interface HeatStep {
  level: number;
  from: number;
  to: number;
}

/**
 * Legend of the heat map for the fill levels of `shade(count, max)` (geo.ts): level 0 is "no case", levels 1–4
 * cover `((l-1)·max/4, l·max/4]`. Levels no whole count falls into are left out.
 */
export function heatLegend(max: number): HeatStep[] {
  const steps: HeatStep[] = [{ level: 0, from: 0, to: 0 }];
  if (max <= 0) return steps;
  for (let level = 1; level <= 4; level++) {
    const from = level === 1 ? 1 : Math.floor(((level - 1) * max) / 4) + 1;
    const to = level === 4 ? max : Math.floor((level * max) / 4);
    if (from <= to) steps.push({ level, from, to });
  }
  return steps;
}

/** "Kecamatan Cibening (fictional)" -> "Cibening": short label inside a map shape (full name stays in the title). */
export function shortDistrictName(name: string): string {
  return name
    .replace(/^(Kecamatan|Kec\.)\s+/i, "")
    .replace(/\s*\((fictional|fiktif)\)$/i, "")
    .trim();
}

// --- Decision log entries ---------------------------------------------------------------------------------------

export type ActorCategory = "agent" | "validator" | "institution" | "citizen" | "system";

export interface EntryDecision {
  actor?: { kind?: string; name?: string; service?: string };
  reason?: string;
  status_label?: string;
  evidence_refs?: unknown[];
}

/** The `decision` object of a log entry (an agesoa.decision.recorded event), or an empty object. */
export function entryDecision(entry: Pick<LogEntry, "entry">): EntryDecision {
  const value = entry.entry as { decision?: unknown } | null;
  const decision = value?.decision;
  return decision && typeof decision === "object" ? (decision as EntryDecision) : {};
}

/**
 * Who made a decision, as the public log shows it: an AI agent, a validator (human, trust), an institution (human,
 * delivery), a citizen reporter (human, ingestion), or the system (rules, quorum, webhooks, probes).
 */
export function actorCategory(entry: Pick<LogEntry, "entry" | "source_service">): ActorCategory {
  const actor = entryDecision(entry).actor ?? {};
  const kind = (actor.kind ?? "").toLowerCase();
  const name = (actor.name ?? "").toLowerCase();
  const service = actor.service ?? entry.source_service;
  if (kind === "agent" || kind === "ai") return "agent";
  if (kind === "human") {
    if (name.startsWith("institution") || service === "delivery") return "institution";
    if (name.includes("validator") || service === "trust") return "validator";
    if (service === "ingestion" || name.includes("reporter")) return "citizen";
    return "validator";
  }
  return "system";
}

export type ChainState = "intact" | "mismatch" | "untrusted" | "unchecked";

/**
 * Chain state of one entry. With a verification of the whole chain: entries before the first invalid one are intact,
 * that one is a mismatch, the ones after it cannot be trusted. Without it (service unavailable): the entry is intact
 * when its prev_hash equals the hash of the entry before it, a mismatch when not, unchecked when that is unknown.
 */
export function entryChainState(
  entry: Pick<LogEntry, "seq" | "prev_hash">,
  verification: LogVerification | null,
  previousHash: string | null | undefined,
): ChainState {
  if (verification) {
    if (verification.ok) return entry.seq <= verification.length ? "intact" : "unchecked";
    const bad = verification.first_invalid_seq;
    if (bad !== null) {
      if (entry.seq < bad) return "intact";
      return entry.seq === bad ? "mismatch" : "untrusted";
    }
  }
  if (previousHash === undefined || previousHash === null) return "unchecked";
  return previousHash === entry.prev_hash ? "intact" : "mismatch";
}

/** `after` of the log page window that holds `seq` (windows of `size` aligned on 0: 1–50, 51–100, …). */
export function windowAfter(seq: number, size: number): number {
  return seq <= 0 ? 0 : Math.floor((seq - 1) / size) * size;
}

/** "9f2c41ab…e8a41": head and tail of a hash, as the design writes it. */
export function middleHash(hash: string | null | undefined, head = 8, tail = 5): string {
  if (!hash) return "—";
  return hash.length > head + tail + 1 ? `${hash.slice(0, head)}…${hash.slice(-tail)}` : hash;
}
