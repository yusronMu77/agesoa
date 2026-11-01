import type { Metadata } from "next";
import { OrganizationCase } from "@/components/case/ConsoleCase";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

type Params = Promise<{ organizationId: string; caseId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("public.case.title", { id: decodeURIComponent((await params).caseId) }) };
}

/** A delivered case, inside the organization console. */
export default async function OrganizationCasePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { organizationId, caseId } = await params;
  return (
    <OrganizationCase
      organizationId={decodeURIComponent(organizationId)}
      caseId={decodeURIComponent(caseId)}
      verify={(await searchParams).verify === "1"}
    />
  );
}
