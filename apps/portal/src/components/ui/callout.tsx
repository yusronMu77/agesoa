import type { HTMLAttributes, ReactNode } from "react";
import { alertVariants } from "@agesoa/ui/components/alert";
import { cn } from "@agesoa/ui/lib/utils";

export type CalloutTone = "info" | "error";

interface CalloutProps extends HTMLAttributes<HTMLElement> {
  as?: "p" | "div" | "section";
  tone?: CalloutTone;
}

/** Highlighted message block. Pass `role="status"` for results and `role="alert"` for errors after an action. */
export function Callout({ as: Tag = "p", tone = "info", className, ...rest }: CalloutProps) {
  return (
    <Tag
      data-slot="alert"
      className={cn("callout mb-6", alertVariants({ variant: tone === "error" ? "destructive" : "default" }), "block", className)}
      {...rest}
    />
  );
}

/** A titled callout section: data unavailable, empty list, or a result that needs a heading. */
export function Notice({ id, title, tone = "info", children }: { id: string; title: ReactNode; tone?: CalloutTone; children: ReactNode }) {
  return (
    <Callout as="section" tone={tone} aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {children}
    </Callout>
  );
}
