import type { HTMLAttributes } from "react"
import { LOGO_MARK_RATIO, LOGO_MARK_SRC } from "@agesoa/ui/assets/logo-mark"
import { cn } from "@agesoa/ui/lib/utils"

/** Penpot `Logo mark`: the "A" with its orbit. Decorative (empty alt): the wordmark or link text names AGESOA. */
function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <img
      src={LOGO_MARK_SRC}
      alt=""
      width={Math.round(size * LOGO_MARK_RATIO)}
      height={size}
      data-slot="logo-mark"
      className={cn("shrink-0", className)}
    />
  )
}

/** Penpot `Logo lengkap`: mark + wordmark in Saira. `tone="ink"` is for the dark header. */
function Logo({
  tone = "light",
  size = 32,
  className,
  children = "AGESOA",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: "light" | "ink"; size?: number }) {
  return (
    <span
      data-slot="logo"
      className={cn(
        "inline-flex items-center gap-2.5 font-heading text-xl leading-none font-semibold tracking-[0.01em]",
        tone === "ink" ? "text-[var(--ag-color-neutral-on-ink)]" : "text-foreground",
        className
      )}
      {...props}
    >
      <LogoMark size={size} />
      {children}
    </span>
  )
}

export { Logo, LogoMark }
