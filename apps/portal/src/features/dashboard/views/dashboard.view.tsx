import { PageHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/ui/callout";
import { formatTime } from "@/lib/format";
import { DistrictMapSection, DistrictTable } from "../components/district-map";
import { PublicFindingList } from "../components/public-finding-list";
import { StatGrid } from "../components/stat-grid";
import type { DashboardData } from "../server/load-dashboard";

/** SCR-040 when the read model did not answer. */
export function DashboardUnavailableView() {
  return (
    <>
      <h1>Public dashboard</h1>
      <Notice id="dash-error" tone="error" title="The public data is temporarily unavailable">
        <p>The read model did not answer. Please try again in a moment.</p>
      </Notice>
    </>
  );
}

/** SCR-040: public dashboard, cases by district and every audit finding. */
export function DashboardView({ caseCount, findings, summary, map }: DashboardData) {
  return (
    <>
      <div className="dash-hero">
        <div className="dash-hero__intro">
          <PageHeader>
            <h1>Public dashboard</h1>
            <p className="lead">
              Cases and audit findings by district. Locations are shown as districts only, never as coordinates, and no
              person is named. Data from the public read model{summary ? `, updated ${formatTime(summary.updated_at)}` : ""}.
            </p>
          </PageHeader>
          <StatGrid caseCount={caseCount} findingCount={findings.length} summary={summary} />
        </div>
        <DistrictMapSection map={map} />
        <DistrictTable map={map} />
      </div>

      <section aria-labelledby="findings-heading" className="dash-findings">
        <h2 id="findings-heading">Audit findings</h2>
        <p className="muted">AI drafts findings; a finding is final only after a quorum of human validators approved it.</p>
        <PublicFindingList findings={findings} />
      </section>
    </>
  );
}
