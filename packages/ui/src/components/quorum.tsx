import type { HTMLAttributes } from "react"
import { CheckIcon, XIcon } from "lucide-react"
import { cn } from "@agesoa/ui/lib/utils"

/**
 * Penpot `Kuorum`: one circle per required validator decision, filled once a validator approved (or crossed when
 * one rejected). Decorative: the status text next to it carries the meaning.
 */
function QuorumDots({
  required,
  approvals,
  rejections = 0,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { required: number; approvals: number; rejections?: number }) {
  const slots = Math.max(required, approvals + rejections)
  return (
    <span aria-hidden="true" data-slot="quorum" className={cn("inline-flex items-center gap-1.5", className)} {...props}>
      {Array.from({ length: slots }, (_, i) => {
        const kind = i < approvals ? "approved" : i < approvals + rejections ? "rejected" : "open"
        return (
          <span
            key={i}
            data-state={kind}
            className={cn(
              "inline-flex size-6 items-center justify-center rounded-full border-2 [&>svg]:size-3.5",
              kind === "approved" && "border-[var(--ag-color-feedback-success)] bg-[var(--ag-color-feedback-success)] text-white",
              kind === "rejected" && "border-destructive bg-destructive text-white",
              kind === "open" && "border-[var(--ag-color-border-strong)] bg-card"
            )}
          >
            {kind === "approved" ? <CheckIcon /> : kind === "rejected" ? <XIcon /> : null}
          </span>
        )
      })}
    </span>
  )
}

export { QuorumDots }
