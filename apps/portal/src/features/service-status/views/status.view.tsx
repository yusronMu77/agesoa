import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { ROUTES } from "@/configs/routes.config";
import { formatTime } from "@/lib/format";
import type { StatusReport } from "@/services/platform/status.service";
import { StatusTable } from "../components/status-table";
import { OVERALL_LABEL } from "../constants";

export function StatusView({ report }: { report: StatusReport }) {
  const overall = OVERALL_LABEL[report.overall];
  return (
    <>
      <PageHeader
        aside={
          <Badge tone={overall.tone} testId="overall-status">
            {overall.label}
          </Badge>
        }
      >
        <h1>Service status</h1>
        <p className="muted">
          Checked <time dateTime={report.checked_at}>{formatTime(report.checked_at)}</time>. Reload the page to
          check again.
        </p>
      </PageHeader>

      <StatusTable services={report.services} />
      <p className="muted" style={{ marginTop: "var(--ag-space-4)" }}>
        Machine-readable: <a href={ROUTES.api.status}>/api/status</a>
      </p>
    </>
  );
}
