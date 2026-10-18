import { alertVariants } from "@agesoa/ui/components/alert";
import { badgeVariants } from "@agesoa/ui/components/badge";
import { buttonVariants } from "@agesoa/ui/components/button";
import { cn } from "@agesoa/ui/lib/utils";

/** Class names of the shared @agesoa/ui components for Witness markup (buttons, labels styled as buttons, pills). */

type ButtonKind = "primary" | "neutral" | "danger" | "link" | "ghost";

const BUTTON_VARIANT = { primary: "default", neutral: "outline", danger: "destructive", link: "link", ghost: "ghost" } as const;

/** A Witness button: always the 48 px touch target; `wide` fills the row, `small` uses the small text size, `start` aligns icon and text to the left (Penpot action rows). */
export function button(kind: ButtonKind = "neutral", opts: { wide?: boolean; small?: boolean; start?: boolean } = {}): string {
  return cn(
    buttonVariants({ variant: BUTTON_VARIANT[kind], size: kind === "link" ? "default" : "touch" }),
    kind === "link" && "justify-start",
    kind === "ghost" && "text-primary",
    opts.wide && "w-full whitespace-normal",
    opts.small && "text-sm",
    opts.start && "justify-start",
  );
}

type PillTone = "ok" | "error" | "neutral";

// Evidence status uses EvidenceBadge from @agesoa/ui; this helper is for plain result tones.
const PILL_VARIANT = { ok: "success", error: "destructive", neutral: "neutral" } as const;

export function pill(tone: PillTone): string {
  return badgeVariants({ variant: PILL_VARIANT[tone] });
}

/** An info or error message line (Penpot `Callout`), with a leading text glyph instead of an icon. */
export function notice(tone: "info" | "error"): string {
  return cn(alertVariants({ variant: tone === "error" ? "destructive" : "info" }), "flex items-start gap-2 p-3 text-sm");
}
