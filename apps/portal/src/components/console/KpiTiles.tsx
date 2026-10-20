import type { ReactNode } from "react";

export interface Kpi {
  label: string;
  value: ReactNode;
  sub?: string;
  testId?: string;
}

/** KPI tiles (agesoa-uiux "KPI tile") over the global .stat-grid: label, value, one line of context. */
export function KpiTiles({ items, label }: { items: Kpi[]; label: string }) {
  return (
    <ul className="stat-grid" aria-label={label}>
      {items.map((kpi) => (
        <li key={kpi.label} className="card" data-testid={kpi.testId}>
          <span className="stat-label">{kpi.label}</span>
          <span className="stat-value">{kpi.value}</span>
          {kpi.sub ? <span className="stat-sub">{kpi.sub}</span> : null}
        </li>
      ))}
    </ul>
  );
}
