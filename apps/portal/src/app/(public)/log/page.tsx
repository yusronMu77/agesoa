import type { Metadata } from "next";
import { DecisionLogView } from "@/components/log/DecisionLog";
import { getT } from "@/lib/i18n/server";

// SCR-042 public decision log; the same view runs inside the validator and institution consoles.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("public.logPage.title") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function LogPage({ searchParams }: { searchParams: SearchParams }) {
  return <DecisionLogView searchParams={searchParams} />;
}
