import type { EvidenceStatus } from "@/services/read-model/read-model.model";

export interface DashboardStats {
  cases: number;
  areas: number;
  reports: number;
  findings: number;
  byStatus: Record<EvidenceStatus, number>;
  validated: number;
}

const STATUS_WORD: Record<EvidenceStatus, string> = { proven: "proven", supported: "supported", alleged: "alleged" };

/** "1 supported, 2 alleged": the evidence status of the findings, most certain first. */
function statusCaption(byStatus: Record<EvidenceStatus, number>): string {
  const parts = (["proven", "supported", "alleged"] as const).filter((s) => byStatus[s] > 0).map((s) => `${byStatus[s]} ${STATUS_WORD[s]}`);
  return parts.length ? parts.join(", ") : "none yet";
}

/** Penpot `KPI tile` × 3: label, number, caption. */
export function StatGrid({ stats }: { stats: DashboardStats }) {
  const tiles = [
    {
      label: "Active cases",
      value: stats.cases,
      caption: `in ${stats.areas} ${stats.areas === 1 ? "area" : "areas"} · ${stats.reports} ${stats.reports === 1 ? "report" : "reports"}`,
    },
    { label: "Audit findings", value: stats.findings, caption: statusCaption(stats.byStatus) },
    { label: "Validated by people", value: stats.validated, caption: "approved by a quorum of validators" },
  ];
  return (
    <ul className="kpi-grid" aria-label="Summary" data-testid="dashboard-stats">
      {tiles.map((t) => (
        <li key={t.label} className="kpi-tile">
          <span className="kpi-tile__label">{t.label}</span>
          <span className="kpi-tile__value">{t.value}</span>
          <span className="kpi-tile__caption">{t.caption}</span>
        </li>
      ))}
    </ul>
  );
}
