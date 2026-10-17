import type { DeliveryAttempt } from "@/services/delivery/delivery.model";

/** "1: 500, 2: 503, 3: 200" — one entry per attempt, the HTTP status or the error when there was no answer. */
export function attemptsSummary(attempts: DeliveryAttempt[]): string {
  if (attempts.length === 0) return "—";
  return [...attempts]
    .sort((a, b) => a.attempt - b.attempt)
    .map((a) => `${a.attempt}: ${a.http_status ?? a.error ?? "no answer"}`)
    .join(", ");
}
