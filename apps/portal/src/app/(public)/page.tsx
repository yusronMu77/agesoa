import type { Metadata } from "next";
import { PublicDashboard } from "@/components/public/PublicDashboard";
import { getT } from "@/lib/i18n/server";

// SCR-040 on the home page: the public dashboard is the portal's front door (the old intro moved to /about).
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("public.dashboard.title") };
}

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  return <PublicDashboard basePath="/" searchParams={await searchParams} />;
}
