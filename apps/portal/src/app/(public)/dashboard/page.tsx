import type { Metadata } from "next";
import { parseFilters } from "@/features/dashboard/lib/filters";
import { loadDashboard } from "@/features/dashboard/server/load-dashboard";
import { DashboardUnavailableView, DashboardView } from "@/features/dashboard/views/dashboard.view";
import type { PageProps } from "@/lib/page-props";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Public dashboard" };

export default async function DashboardPage({ searchParams }: PageProps) {
  const data = await loadDashboard(parseFilters(await searchParams));
  return data.ok ? <DashboardView {...data} /> : <DashboardUnavailableView />;
}
