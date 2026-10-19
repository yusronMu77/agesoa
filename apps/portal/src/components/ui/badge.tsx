import type { HTMLAttributes } from "react";
import { Badge as UiBadge } from "@agesoa/ui/components/badge";

export type BadgeTone = "ok" | "warn" | "error" | "neutral";

const ICON: Record<BadgeTone, string> = { ok: "●", warn: "▲", error: "✕", neutral: "○" };
const VARIANT = { ok: "success", warn: "warning", error: "destructive", neutral: "neutral" } as const;

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone: BadgeTone;
  testId?: string;
  /** Leading shape that repeats the tone for people who cannot tell the colours apart (default on). */
  icon?: boolean;
}

/** Status pill; the text carries the meaning, colour only reinforces it. */
export function Badge({ tone, testId, icon = true, children, ...rest }: BadgeProps) {
  return (
    <UiBadge variant={VARIANT[tone]} data-testid={testId} {...rest}>
      {icon ? <span aria-hidden="true">{ICON[tone]}</span> : null}
      {children}
    </UiBadge>
  );
}
