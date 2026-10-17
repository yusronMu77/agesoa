import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@agesoa/ui/lib/utils"

// Penpot `Badge` and `Badge status bukti`: a pill whose text carries the meaning; colour only reinforces it.
// Evidence status: alleged (Dugaan), supported (Didukung bukti), proven (Terbukti).
const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2.5 py-0.5 text-sm leading-5 font-medium whitespace-nowrap transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 [&>svg]:pointer-events-none [&>svg]:size-3.5!",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border bg-card text-foreground",
        neutral: "border-[var(--ag-color-border-strong)] bg-card text-muted-foreground",
        success: "border-current bg-card text-[var(--ag-color-feedback-success)]",
        warning: "border-current bg-card text-[var(--ag-color-feedback-warning)]",
        destructive: "border-current bg-card text-destructive",
        alleged: "border-[var(--ag-color-border-strong)] bg-[var(--ag-color-evidence-alleged)] text-foreground",
        supported: "border-[var(--ag-color-border-strong)] bg-[var(--ag-color-evidence-supported)] text-foreground",
        proven: "border-[var(--ag-color-border-strong)] bg-[var(--ag-color-evidence-proven)] text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
