import { InfoIcon } from "@/components/shared/icons";
import { Notice } from "@/components/ui/callout";
import { ContextForm } from "../components/context-form";
import { DistrictMapSection } from "../components/district-map";
import { LatestLog } from "../components/latest-log";
import { PublicFindingList } from "../components/public-finding-list";
import { StatGrid } from "../components/stat-grid";
import { StatusFilter } from "../components/status-filter";
import type { DashboardData } from "../server/load-dashboard";

/** SCR-040 when the read model did not answer. */
export function DashboardUnavailableView() {
  return (
    <>
      <h1>Why does this problem keep happening in your area?</h1>
      <Notice id="dash-error" tone="error" title="The public data is temporarily unavailable">
        <p>The read model did not answer. Please try again in a moment.</p>
      </Notice>
    </>
  );
}

/** Penpot `Callout`: how to read the evidence status of a finding. */
function EvidenceCallout() {
  return (
    <aside className="evidence-callout" aria-labelledby="evidence-callout-title">
      <InfoIcon size={20} />
      <div>
        <p id="evidence-callout-title" className="evidence-callout__title">
          How to read evidence status
        </p>
        <p>Alleged: just reported. Supported: documents, photos or patterns back it. Proven: a quorum of validators agrees.</p>
      </div>
    </aside>
  );
}

/** SCR-040 (Penpot board "SCR-040 Dasbor publik - EN"): context, hero with KPIs and map, findings with the latest log. */
export function DashboardView({ filters, options, stats, findings, caseById, map, latestLog }: DashboardData) {
  return (
    <div className="dash">
      <div className="dash-context">
        <ContextForm filters={filters} types={options.types} regions={options.regions} />
        {map.anySynthetic ? (
          <p className="dash-context__note">
            Demo data: the regency on this map is fictional, and synthetic cases are drawn only on fictional districts.
          </p>
        ) : null}
      </div>

      <div className="dash-hero">
        <div className="dash-hero__intro">
          <div className="dash-hero__title">
            <h1>Why does this problem keep happening in your area?</h1>
            <p className="dash-hero__lead">
              Open social audit: every finding names its evidence and who decided, and you can verify it yourself in the
              decision log.
            </p>
          </div>
          <StatGrid stats={stats} />
          <EvidenceCallout />
        </div>
        <DistrictMapSection map={map} />
      </div>

      <StatusFilter filters={filters} shown={findings.length} />

      <div className="dash-findings">
        <section aria-labelledby="findings-heading" className="dash-findings__list">
          <h2 id="findings-heading" className="sr-only">
            Audit findings
          </h2>
          <PublicFindingList findings={findings} caseById={caseById} />
        </section>
        <LatestLog entries={latestLog} />
      </div>
    </div>
  );
}
