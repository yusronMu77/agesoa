import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "ok" | "warn" | "error" | "neutral";

const ICON: Record<BadgeTone, string> = { ok: "●", warn: "▲", error: "✕", neutral: "○" };

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone: BadgeTone;
  testId?: string;
  /** Leading shape that repeats the tone for people who cannot tell the colours apart (default on). */
  icon?: boolean;
}

/** Status pill; the text carries the meaning, colour only reinforces it. */
export function Badge({ tone, testId, icon = true, className, children, ...rest }: BadgeProps) {
  return (
    <span className={cn("badge", `badge--${tone}`, className)} data-testid={testId} {...rest}>
      {icon ? <span aria-hidden="true">{ICON[tone]}</span> : null}
      {children}
    </span>
  );
}
