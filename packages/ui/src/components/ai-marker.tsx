import type { HTMLAttributes } from "react"
import { CpuIcon } from "lucide-react"
import { cn } from "@agesoa/ui/lib/utils"

/**
 * Marks agent output (Penpot `AI marker`): a text label with a neutral icon, never sparkles. `block` is the
 * full-width line above an AI draft; the default is an inline pill next to a heading.
 */
function AiMarker({
  as: Tag = "span",
  block = false,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & { as?: "span" | "p" | "div"; block?: boolean }) {
  return (
    <Tag
      data-slot="ai-marker"
      className={cn(
        "items-center gap-1.5 bg-[var(--ag-color-ai-bg)] text-sm font-medium text-[var(--ag-color-ai-fg)] [&>svg]:size-4 [&>svg]:shrink-0",
        block ? "m-0 flex rounded-md p-3" : "inline-flex rounded-full px-2.5 py-0.5",
        className
      )}
      {...props}
    >
      <CpuIcon aria-hidden="true" />
      {children}
    </Tag>
  )
}

/** A full-width AI box (Penpot `AI marker` above a draft): the marker title with the instruction under it. */
function AiCallout({
  title,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { title: string }) {
  return (
    <div
      data-slot="ai-callout"
      className={cn(
        "grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 rounded-md bg-[var(--ag-color-ai-bg)] p-4 text-[var(--ag-color-ai-fg)]",
        className
      )}
      {...props}
    >
      <CpuIcon aria-hidden="true" className="mt-0.5 size-5" />
      <p className="m-0 text-sm font-medium">{title}</p>
      {children && <div className="col-start-2 text-base text-foreground">{children}</div>}
    </div>
  )
}

export { AiCallout, AiMarker }
