import { loadConfig } from "@/configs/env.config";
import { createBackend } from "@/services/backend";
import type { DashboardStats } from "../components/stat-grid";
import { buildDistrictMap } from "../lib/district-map";
import { applyFilters, countByStatus, type DashboardFilters, filterOptions } from "../lib/filters";

/** Entries in the "Latest log" panel. */
const LATEST_LOG = 4;

/** SCR-040: cases, findings, district boundaries and stats from the public read model; the newest log entries. */
export async function loadDashboard(filters: DashboardFilters) {
  const { readModel, transparency } = createBackend(loadConfig());
  const [cases, findings, districts, head] = await Promise.all([
    readModel.listCases(),
    readModel.listFindings(),
    readModel.listDistricts(),
    transparency.getLogHead(),
  ]);
  if (!cases.ok || !findings.ok || !districts.ok) return { ok: false as const };

  const latest = head.ok
    ? head.data.seq > 0
      ? await transparency.getLogPage({ after: Math.max(0, head.data.seq - LATEST_LOG), limit: LATEST_LOG })
      : null
    : head;

  const sorted = [...findings.data].sort((a, b) => (a.case_id ?? "").localeCompare(b.case_id ?? ""));
  const view = applyFilters({ cases: cases.data, districts: districts.data, findings: sorted }, filters);
  const map = buildDistrictMap(view.cases, view.districts);
  const stats: DashboardStats = {
    cases: view.cases.length,
    areas: map.casesPerDistrict.size,
    reports: view.cases.reduce((sum, c) => sum + c.report_count, 0),
    findings: view.findings.length,
    byStatus: countByStatus(view.findings),
    validated: view.findings.filter((f) => f.validation?.outcome === "approved").length,
  };

  return {
    ok: true as const,
    filters,
    options: filterOptions(cases.data, districts.data),
    stats,
    findings: view.listed,
    caseById: view.caseById,
    map,
    latestLog: latest === null ? [] : latest.ok ? [...latest.data.items].reverse() : null,
  };
}

export type DashboardData = Extract<Awaited<ReturnType<typeof loadDashboard>>, { ok: true }>;
