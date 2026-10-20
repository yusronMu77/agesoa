import type { ReactNode } from "react";

export type BadgeTone = "ok" | "warn" | "error" | "neutral";

/** Status pill; the text carries the meaning, colour only reinforces it. */
export function Badge({ tone, children, testId }: { tone: BadgeTone; children: ReactNode; testId?: string }) {
  return (
    <span className={`badge badge--${tone}`} data-testid={testId}>
      <span aria-hidden="true">{tone === "ok" ? "●" : tone === "error" ? "✕" : tone === "warn" ? "▲" : "○"}</span>
      {children}
    </span>
  );
}
