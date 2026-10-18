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

export { AiMarker }
