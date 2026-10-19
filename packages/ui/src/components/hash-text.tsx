import type { HTMLAttributes } from "react"
import { cn } from "@agesoa/ui/lib/utils"

/** A hash, report code or ID in IBM Plex Mono; long values wrap anywhere instead of widening the page. */
function HashText({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <code data-slot="hash" className={cn("font-mono text-[0.875em] break-all", className)} {...props} />
}

export { HashText }
