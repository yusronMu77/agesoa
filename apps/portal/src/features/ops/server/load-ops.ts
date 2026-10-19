import { redirect } from "next/navigation";
import { loadConfig } from "@/configs/env.config";
import { ROUTES } from "@/configs/routes.config";
import { serviceEvents } from "@/services/platform/ops.service";
import { getStatusReport } from "@/services/platform/status.service";

/** SCR-090 "Machine": readiness of every service plus its outbox/inbox counts (operator token). */
export async function loadOps(token: string) {
  const config = loadConfig();
  const [status, events] = await Promise.all([getStatusReport(config), serviceEvents(config, token)]);
  if (events.every((e) => !e.result.ok && e.result.status === 401)) redirect(ROUTES.login(ROUTES.ops));
  const denied = events.every((e) => !e.result.ok && (e.result.status === 401 || e.result.status === 403));
  return { demoMode: config.demoMode, status, events, denied };
}

export type OpsData = Awaited<ReturnType<typeof loadOps>>;
