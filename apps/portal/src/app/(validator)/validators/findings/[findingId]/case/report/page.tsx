import type { Metadata } from "next";
import { ValidatorCase } from "@/components/case/ConsoleCase";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

type Params = Promise<{ findingId: string }>;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("public.report.crumb") };
}

/** The audit report of a finding's case, inside the validator console. */
export default async function ValidatorFindingReportPage({ params }: { params: Params }) {
  return <ValidatorCase findingId={decodeURIComponent((await params).findingId)} report />;
}
