import type { PublicStats } from "@/services/read-model/read-model.model";
import { total } from "../lib/district-map";

export function StatGrid({ caseCount, findingCount, summary }: { caseCount: number; findingCount: number; summary: PublicStats | null }) {
  const stats = [
    { value: caseCount, label: "cases" },
    { value: findingCount, label: "findings" },
    { value: summary ? total(summary.validations_by_outcome) : "—", label: "validated by people" },
    { value: summary?.reports_received ?? "—", label: "citizen reports" },
  ];
  return (
    <ul className="stat-grid" aria-label="Summary" data-testid="dashboard-stats">
      {stats.map((s) => (
        <li key={s.label} className="card">
          <span className="stat-value">{s.value}</span>
          <span className="muted">{s.label}</span>
        </li>
      ))}
    </ul>
  );
}
