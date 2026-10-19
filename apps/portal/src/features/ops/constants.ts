import type { ServiceName } from "@/configs/env.config";

/** Agents run inside the service of their domain (no agent is a service of its own). */
export const AGENTS: Record<ServiceName, string[]> = {
  ingestion: ["Intake agent", "Privacy guard", "Signal agent"],
  "case-audit": ["Audit agent"],
  trust: ["Role agent", "Quorum rule"],
  delivery: ["Report agent"],
  transparency: ["Decision log writer", "Read model projection"],
};

/** Result of the demo reset, carried in `?reset=`. */
export type ResetOutcome = "ok" | "failed" | "unconfirmed";
