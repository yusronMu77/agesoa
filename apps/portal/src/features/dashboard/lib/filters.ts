/** SCR-040 filters (issue type, region, evidence status), read from the query string and applied to read-model data. */

import { ROUTES } from "@/configs/routes.config";
import type { EvidenceStatus, PublicCase, PublicDistrict, PublicFinding } from "@/services/read-model/read-model.model";

export const EVIDENCE_STATUSES: readonly EvidenceStatus[] = ["alleged", "supported", "proven"];

export interface DashboardFilters {
  /** Case category id (from the domain pack), null = all issue types. */
  type: string | null;
  /** Regency code, null = all regions. */
  region: string | null;
  /** Evidence status of the listed findings, null = all. */
  status: EvidenceStatus | null;
}

export interface FilterOption {
  value: string;
  label: string;
}

type Query = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined) => (typeof value === "string" && value !== "" ? value : null);

export function parseFilters(query: Query): DashboardFilters {
  const status = one(query.status);
  return {
    type: one(query.type),
    region: one(query.region),
    status: status && (EVIDENCE_STATUSES as readonly string[]).includes(status) ? (status as EvidenceStatus) : null,
  };
}

/** "kitchen_hygiene" → "Kitchen hygiene": a readable label for a category id without knowing the domain pack. */
export function humanize(id: string): string {
  const words = id.replace(/[_-]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : id;
}

const regionKey = (region: PublicCase["region"]) => region?.regency_code ?? region?.regency_name ?? null;

/** Issue types present in the cases, and the regencies of the published districts. */
export function filterOptions(cases: PublicCase[], districts: PublicDistrict[]): { types: FilterOption[]; regions: FilterOption[] } {
  const types = [...new Set(cases.map((c) => c.category).filter((c): c is string => !!c))].sort();
  const regions = new Map<string, string>();
  for (const d of districts) regions.set(d.regency_code, d.regency_name);
  for (const c of cases) {
    const key = regionKey(c.region);
    if (key && c.region && !regions.has(key)) regions.set(key, c.region.regency_name);
  }
  return {
    types: types.map((t) => ({ value: t, label: humanize(t) })),
    regions: [...regions].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)),
  };
}

/**
 * Cases, districts and findings inside the issue type and region filters, plus the findings that also match the
 * evidence status filter (the list). A finding takes its issue type from its case.
 */
export function applyFilters(
  data: { cases: PublicCase[]; districts: PublicDistrict[]; findings: PublicFinding[] },
  filters: DashboardFilters,
) {
  const inRegion = (region: PublicCase["region"]) => !filters.region || regionKey(region) === filters.region;
  const cases = data.cases.filter((c) => inRegion(c.region) && (!filters.type || c.category === filters.type));
  const caseById = new Map(data.cases.map((c) => [c.case_id, c]));
  const findings = data.findings.filter((f) => {
    const category = f.case_id ? caseById.get(f.case_id)?.category : null;
    return inRegion(f.region) && (!filters.type || category === filters.type);
  });
  return {
    cases,
    districts: filters.region ? data.districts.filter((d) => d.regency_code === filters.region) : data.districts,
    findings,
    listed: filters.status ? findings.filter((f) => f.status === filters.status) : findings,
    caseById,
  };
}

/** Findings per evidence status. */
export function countByStatus(findings: PublicFinding[]): Record<EvidenceStatus, number> {
  const counts: Record<EvidenceStatus, number> = { alleged: 0, supported: 0, proven: 0 };
  for (const f of findings) if (f.status) counts[f.status] += 1;
  return counts;
}

/** The dashboard URL with one filter changed (null removes it). */
export function filterHref(filters: DashboardFilters, change: Partial<DashboardFilters>): string {
  const next = { ...filters, ...change };
  const params = new URLSearchParams();
  if (next.type) params.set("type", next.type);
  if (next.region) params.set("region", next.region);
  if (next.status) params.set("status", next.status);
  const query = params.toString();
  return query ? `${ROUTES.dashboard}?${query}` : ROUTES.dashboard;
}
