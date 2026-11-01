import type { Metadata } from "next";
import { CaseReportView } from "@/components/case/CaseReportView";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

type Params = Promise<{ caseId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { t } = await getT();
  return { title: `${t("public.report.crumb")} · ${decodeURIComponent((await params).caseId)}` };
}

export default async function AuditReportPage({ params }: { params: Params }) {
  return <CaseReportView caseId={decodeURIComponent((await params).caseId)} />;
}
