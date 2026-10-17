import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { EvidenceBadge } from "@/components/shared/evidence-badge";
import { Callout } from "@/components/ui/callout";
import { ROUTES } from "@/configs/routes.config";
import { formatTime } from "@/lib/format";
import { Recommendations, ReportLog, ReportValidators, RootCauses } from "../components/audit-report";
import type { AuditReportData } from "../server/load-case";

export function AuditReportUnavailableView() {
  return (
    <Callout tone="error" role="alert">
      The public data is temporarily unavailable. Please try again in a moment.
    </Callout>
  );
}

/**
 * SCR-041 audit report of a case: root causes with their evidence status, recommendations, who validated, and the
 * decision log entries behind it. Everything comes from the public read model and the public log.
 */
export function AuditReportView({ caseId, kase, report, findings, log }: AuditReportData) {
  return (
    <>
      <nav aria-label="Breadcrumb">
        <p>
          <Link href={ROUTES.dashboard}>Public dashboard</Link> / <Link href={ROUTES.case(caseId)}>{caseId}</Link> / Audit
          report
        </p>
      </nav>

      {!report ? (
        <section className="card" data-testid="audit-report-missing">
          <h1>Audit report</h1>
          <p className="muted">
            No audit report for this case yet. A report is written after the findings of the case have been validated.
          </p>
        </section>
      ) : (
        <article data-testid="audit-report">
          <PageHeader>
            <p>
              <EvidenceBadge status={kase.max_finding_status} /> <span className="muted">{kase.category ?? kase.domain}</span>
            </p>
            <h1 data-testid="audit-report-summary">{report.summary}</h1>
            <p className="muted">
              {kase.region?.regency_name ?? "Unknown region"} · {kase.report_count} report{kase.report_count === 1 ? "" : "s"} ·
              written {formatTime(report.created_at)}
              {kase.synthetic ? " · synthetic (demo) data" : ""}
            </p>
          </PageHeader>

          <div className="report-layout">
            <RootCauses causes={report.root_causes} />
            <aside className="report-side">
              <Recommendations items={report.recommendations} />
              <ReportValidators findings={findings} />
              <ReportLog caseId={caseId} log={log} />
            </aside>
          </div>
        </article>
      )}
    </>
  );
}
