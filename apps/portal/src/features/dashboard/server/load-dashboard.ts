import { loadConfig } from "@/configs/env.config";
import { createBackend } from "@/services/backend";
import { buildDistrictMap } from "../lib/district-map";

/** SCR-040: cases, findings, district boundaries and stats from the public read model. */
export async function loadDashboard() {
  const { readModel } = createBackend(loadConfig());
  const [cases, findings, districts, stats] = await Promise.all([
    readModel.listCases(),
    readModel.listFindings(),
    readModel.listDistricts(),
    readModel.getStats(),
  ]);
  if (!cases.ok || !findings.ok || !districts.ok) return { ok: false as const };

  return {
    ok: true as const,
    caseCount: cases.data.length,
    findings: [...findings.data].sort((a, b) => (a.case_id ?? "").localeCompare(b.case_id ?? "")),
    summary: stats.ok ? stats.data : null,
    map: buildDistrictMap(cases.data, districts.data),
  };
}

export type DashboardData = Extract<Awaited<ReturnType<typeof loadDashboard>>, { ok: true }>;
