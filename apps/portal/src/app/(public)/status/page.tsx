import type { Metadata } from "next";
import { loadConfig } from "@/configs/env.config";
import { StatusView } from "@/features/service-status/views/status.view";
import { getStatusReport } from "@/services/platform/status.service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Service status" };

export default async function StatusPage() {
  return <StatusView report={await getStatusReport(loadConfig())} />;
}
