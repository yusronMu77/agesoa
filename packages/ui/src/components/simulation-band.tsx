import type { HTMLAttributes } from "react"
import { InfoIcon } from "lucide-react"
import { cn } from "@agesoa/ui/lib/utils"

/**
 * Penpot `Simulasi banner`: the full-width band shown while demo_mode is on (the data on screen is synthetic).
 * Not dismissible. The app sets the role (`status` or `note`), the text and its own positioning (fixed, sticky).
 */
function SimulationBand({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="simulation-band"
      className={cn(
        "flex items-center justify-center gap-2 bg-[var(--ag-color-simulation-band)] px-4 py-2 text-center text-sm font-bold tracking-[0.02em] text-[var(--ag-color-simulation-on-band)] [&>svg]:size-4 [&>svg]:shrink-0",
        className
      )}
      {...props}
    >
      <InfoIcon aria-hidden="true" />
      {children}
    </div>
  )
}

/** Inline note at the top of a simulation screen (organizations, SIM): "SIMULASI – organisasi fiktif". */
function SimOrgBand({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-slot="sim-org-band"
      className={cn(
        "mb-4 rounded-md border border-[var(--ag-color-brand-accent)] bg-[var(--ag-color-action-accent-subtle)] px-3 py-2 font-bold text-[var(--ag-color-simulation-band)]",
        className
      )}
      {...props}
    />
  )
}

export { SimulationBand, SimOrgBand }
