import type { HTMLAttributes } from "react"
import { CheckIcon } from "lucide-react"
import { cn } from "@agesoa/ui/lib/utils"

export interface StepperStep {
  label: string
  state: "done" | "current" | "upcoming"
}

/**
 * Penpot `Stepper`: numbered steps joined by a line (Witness: Bukti, Periksa, Terkirim). A finished step shows a
 * check, the open one is marked with `aria-current="step"`; the state is written in the list order, never in colour only.
 */
function Stepper({ steps, className, ...props }: { steps: StepperStep[] } & Omit<HTMLAttributes<HTMLOListElement>, "children">) {
  return (
    <ol data-slot="stepper" className={cn("m-0 flex list-none items-center gap-2 p-0", className)} {...props}>
      {steps.map((step, index) => (
        <li
          key={step.label}
          data-state={step.state}
          aria-current={step.state === "current" ? "step" : undefined}
          className={cn("flex items-center gap-2 text-sm", index < steps.length - 1 && "flex-1")}
        >
          <span
            aria-hidden="true"
            className={cn(
              "inline-flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-medium",
              step.state === "upcoming"
                ? "border-[var(--ag-color-border-strong)] bg-card text-muted-foreground"
                : "border-primary bg-primary text-primary-foreground"
            )}
          >
            {step.state === "done" ? <CheckIcon className="size-4" /> : index + 1}
          </span>
          <span className={step.state === "upcoming" ? "text-muted-foreground" : "text-foreground"}>{step.label}</span>
          {index < steps.length - 1 && (
            <span
              aria-hidden="true"
              className={cn("h-0.5 min-w-3 flex-1 rounded-full", step.state === "done" ? "bg-primary" : "bg-[var(--ag-color-border-default)]")}
            />
          )}
        </li>
      ))}
    </ol>
  )
}

export { Stepper }
