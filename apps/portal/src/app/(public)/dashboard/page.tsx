import type { Metadata } from "next";
import { loadDashboard } from "@/features/dashboard/server/load-dashboard";
import { DashboardUnavailableView, DashboardView } from "@/features/dashboard/views/dashboard.view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Public dashboard" };

export default async function DashboardPage() {
  const data = await loadDashboard();
  return data.ok ? <DashboardView {...data} /> : <DashboardUnavailableView />;
}
