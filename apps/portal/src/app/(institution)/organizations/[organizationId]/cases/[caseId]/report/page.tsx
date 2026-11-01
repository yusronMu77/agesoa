import type { Metadata } from "next";
import { OrganizationCase } from "@/components/case/ConsoleCase";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

type Params = Promise<{ organizationId: string; caseId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { t } = await getT();
  return { title: `${t("public.report.crumb")} · ${decodeURIComponent((await params).caseId)}` };
}

/** The audit report of a delivered case, inside the organization console. */
export default async function OrganizationCaseReportPage({ params }: { params: Params }) {
  const { organizationId, caseId } = await params;
  return <OrganizationCase organizationId={decodeURIComponent(organizationId)} caseId={decodeURIComponent(caseId)} report />;
}
