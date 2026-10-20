import type { Metadata } from "next";
import { PublicDashboard } from "@/components/public/PublicDashboard";
import { getT } from "@/lib/i18n/server";

// SCR-040 public dashboard (same view as the home page).
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("public.dashboard.title") };
}

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  return <PublicDashboard basePath="/dashboard" searchParams={await searchParams} />;
}
