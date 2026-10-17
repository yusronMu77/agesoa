import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@agesoa/ui/lib/utils"

// Penpot `Callout` (info / peringatan / bahaya). No default role: pass role="status" for a result and
// role="alert" for an error after an action, so explanations are not announced as alerts.
const alertVariants = cva(
  "group/alert relative grid w-full gap-1 rounded-md border border-l-[6px] bg-card p-4 text-left text-base text-card-foreground has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-3 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: "border-[var(--ag-color-border-strong)]",
        info: "border-[var(--ag-color-feedback-info)] bg-[var(--ag-color-status-info-bg)]",
        warning: "border-[var(--ag-color-feedback-warning)] bg-[var(--ag-color-status-warning-bg)]",
        destructive: "border-destructive text-foreground *:[svg]:text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "font-semibold group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3",
        className
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-sm text-pretty text-muted-foreground [&_a]:underline [&_a]:underline-offset-3 [&_p:not(:last-child)]:mb-4",
        className
      )}
      {...props}
    />
  )
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-action"
      className={cn("absolute top-3 right-3", className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, AlertAction, alertVariants }
