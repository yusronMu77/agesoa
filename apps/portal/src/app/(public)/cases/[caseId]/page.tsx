import type { Metadata } from "next";
import { CaseView } from "@/components/case/CaseView";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

type Params = Promise<{ caseId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("public.case.title", { id: decodeURIComponent((await params).caseId) }) };
}

export default async function CasePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const caseId = decodeURIComponent((await params).caseId);
  return <CaseView caseId={caseId} verify={(await searchParams).verify === "1"} />;
}
