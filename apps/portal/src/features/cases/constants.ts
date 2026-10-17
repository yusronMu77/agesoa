import type { BadgeTone } from "@/components/ui/badge";
import type { FollowUpStatus } from "@/services/read-model/read-model.model";

export const FOLLOW_UP_STATUS_LABEL: Record<FollowUpStatus, string> = {
  received: "Received",
  in_progress: "In progress",
  done: "Done",
};

export const FOLLOW_UP_TONE: Record<FollowUpStatus, BadgeTone> = {
  received: "neutral",
  in_progress: "warn",
  done: "ok",
};

/** "Based on 2 evidence items" / "No evidence item yet" under a root cause. */
export function evidenceCountText(count: number): string {
  if (count <= 0) return "No evidence item yet: reported or inferred only";
  return `Based on ${count} evidence item${count === 1 ? "" : "s"}`;
}
