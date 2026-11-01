import type { Metadata } from "next";
import { ValidatorCase } from "@/components/case/ConsoleCase";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

type Params = Promise<{ findingId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("public.case.crumb") };
}

/** A finding's attached evidence: its case, inside the validator console. */
export default async function ValidatorFindingCasePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const findingId = decodeURIComponent((await params).findingId);
  return <ValidatorCase findingId={findingId} verify={(await searchParams).verify === "1"} />;
}
