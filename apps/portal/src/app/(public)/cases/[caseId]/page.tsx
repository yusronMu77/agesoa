import type { Metadata } from "next";
import { loadCase } from "@/features/cases/server/load-case";
import { CaseDetailView } from "@/features/cases/views/case-detail.view";
import { type PageProps, routeParam } from "@/lib/page-props";

export const dynamic = "force-dynamic";

type Props = PageProps<{ caseId: string }>;

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  return { title: `Case ${await routeParam(params, "caseId")}` };
}

export default async function CasePage({ params, searchParams }: Props) {
  const caseId = await routeParam(params, "caseId");
  const verifyRequested = (await searchParams).verify === "1";
  return <CaseDetailView {...await loadCase(caseId, verifyRequested)} />;
}
