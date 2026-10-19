import { loadConfig } from "@/configs/env.config";
import { getStatusReport } from "@/services/platform/status.service";

export const dynamic = "force-dynamic";

/** Aggregated readiness of the five services; always 200, the state is in the body. */
export async function GET() {
  const report = await getStatusReport(loadConfig());
  return Response.json(report, { headers: { "cache-control": "no-store" } });
}
