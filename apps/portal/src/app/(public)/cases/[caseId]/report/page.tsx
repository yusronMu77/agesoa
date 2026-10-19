import type { Metadata } from "next";
import { loadAuditReport } from "@/features/cases/server/load-case";
import { AuditReportUnavailableView, AuditReportView } from "@/features/cases/views/audit-report.view";
import { type PageProps, routeParam } from "@/lib/page-props";

// SCR-041 Audit report of a case: root causes with their evidence status, recommendations, who validated, and the
// decision log entries behind it. Everything comes from the public read model and the public log.
export const dynamic = "force-dynamic";

type Props = PageProps<{ caseId: string }>;

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  return { title: `Audit report · ${await routeParam(params, "caseId")}` };
}

export default async function AuditReportPage({ params }: Props) {
  const data = await loadAuditReport(await routeParam(params, "caseId"));
  return data.ok ? <AuditReportView {...data} /> : <AuditReportUnavailableView />;
}
