import type { HTMLAttributes, ReactNode } from "react"
import { cn } from "@agesoa/ui/lib/utils"

/**
 * Penpot attachment row: a tile (icon or thumbnail), a name with a small hint line, and an action on the right
 * (usually the ghost "Hapus" button). Used for photos, voice notes and links in Witness.
 */
function AttachmentRow({
  tile,
  title,
  hint,
  action,
  className,
  children,
  ...props
}: { tile: ReactNode; title: ReactNode; hint?: ReactNode; action?: ReactNode } & Omit<HTMLAttributes<HTMLElement>, "title">) {
  return (
    <div
      data-slot="attachment-row"
      className={cn("flex items-center gap-3 rounded-xl border border-[var(--ag-color-border-default)] bg-card p-3", className)}
      {...props}
    >
      <span
        data-slot="attachment-tile"
        className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--ag-color-bg-sunken)] text-muted-foreground [&>svg]:size-6"
      >
        {tile}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium break-words text-foreground">{title}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        {children}
      </span>
      {action}
    </div>
  )
}

export { AttachmentRow }
