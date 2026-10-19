/** Readable lines for decision log entries on the dashboard (the log page keeps the raw action codes). */

import type { LogEntry } from "@/services/transparency/transparency.model";

const ACTIONS: Record<string, string> = {
  "report.received": "Citizen report received",
  "case.opened": "Case opened",
  "case.source_added": "Report added to a case",
  "case.deadline_set": "Evidence deadline set",
  "audit.question_asked": "Follow-up question asked",
  "audit.patterns_tested": "Patterns tested on past incidents",
  "audit.hypotheses_ranked": "Cause branches ranked",
  "finding.drafted": "Finding drafted",
  "finding.approved": "Finding approved by a validator",
  "finding.rejected": "Finding returned by a validator",
  "finding.validated": "Finding validated by the quorum",
  "demo.reset": "Demo data reset",
};

/** "case.deadline_set" → "Evidence deadline set"; an unknown "case.closed" → "Case closed". */
export function actionLabel(action: string): string {
  if (ACTIONS[action]) return ACTIONS[action];
  const words = action.replace(/[._]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : action;
}

interface Actor {
  kind?: string;
  name?: string;
}

function actorOf(entry: LogEntry): Actor | null {
  const decision = (entry.entry as { decision?: { actor?: Actor } } | null)?.decision;
  return decision?.actor ?? null;
}

/**
 * Who decided, by kind and role only: "AI agent", "Rule", "Validator", "Reporter", "System". Human actors are
 * written by role (the log never holds names of people).
 */
export function actorLabel(entry: LogEntry): string {
  const actor = actorOf(entry);
  switch (actor?.kind) {
    case "agent":
    case "ai":
      return "AI agent";
    case "rule":
      return "Rule";
    case "human":
      if (entry.source_service === "trust") return "Validator";
      if (entry.source_service === "ingestion") return "Reporter";
      return "Person";
    default:
      return "System";
  }
}

/** "HH.MM WIB" (UTC+7), as on the design. */
export function timeWib(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const wib = new Date(date.getTime() + 7 * 3600 * 1000);
  const hh = String(wib.getUTCHours()).padStart(2, "0");
  const mm = String(wib.getUTCMinutes()).padStart(2, "0");
  return `${hh}.${mm} WIB`;
}

/** "9f2c41ab…e8a41": the start and end of a hash. */
export function hashPreview(hash: string): string {
  return hash.length > 16 ? `${hash.slice(0, 8)}…${hash.slice(-5)}` : hash;
}
