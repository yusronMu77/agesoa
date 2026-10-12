import { loadConfig } from "@/lib/config";
import { getStatusReport } from "@/lib/status";

export const dynamic = "force-dynamic";

/** Aggregated readiness of the five services; always 200, the state is in the body. */
export async function GET() {
  const report = await getStatusReport(loadConfig());
  return Response.json(report, { headers: { "cache-control": "no-store" } });
}
