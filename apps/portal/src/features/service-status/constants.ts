import type { BadgeTone } from "@/components/ui/badge";
import type { OverallState, ServiceState } from "@/services/platform/status.service";

export const STATE_LABEL: Record<ServiceState, { tone: BadgeTone; label: string }> = {
  ready: { tone: "ok", label: "Ready" },
  not_ready: { tone: "warn", label: "Not ready" },
  down: { tone: "error", label: "Down" },
};

export const OVERALL_LABEL: Record<OverallState, { tone: BadgeTone; label: string }> = {
  ok: { tone: "ok", label: "All services ready" },
  degraded: { tone: "warn", label: "Some services are not ready" },
  down: { tone: "error", label: "All services are down" },
};
