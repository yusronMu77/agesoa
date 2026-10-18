import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@agesoa/ui/lib/utils"

// Penpot `NavItem`: a navigation link. The open section is marked with `aria-current` (the underline only repeats it).
// `tone="ink"` is for the dark header. Pass `render={<Link … />}` to use the framework's link.
const navItemVariants = cva(
  "relative inline-flex min-h-10 items-center px-3 text-base font-medium whitespace-nowrap no-underline transition-colors outline-none focus-visible:ring-[3px] after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:rounded-full after:bg-transparent aria-[current=page]:after:bg-[var(--ag-color-brand-accent)]",
  {
    variants: {
      tone: {
        ink: "text-[var(--ag-color-text-on-ink-muted)] hover:text-[var(--ag-color-text-on-ink)] aria-[current=page]:text-[var(--ag-color-text-on-ink)] focus-visible:ring-[var(--ag-color-text-on-ink)]/60",
        light:
          "text-muted-foreground hover:text-foreground aria-[current=page]:text-foreground focus-visible:ring-ring/50",
      },
    },
    defaultVariants: {
      tone: "light",
    },
  }
)

function NavItem({
  className,
  tone = "light",
  render,
  ...props
}: useRender.ComponentProps<"a"> & VariantProps<typeof navItemVariants>) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        className: cn(navItemVariants({ tone }), className),
      },
      props
    ),
    render,
    state: {
      slot: "nav-item",
      tone,
    },
  })
}

export { NavItem, navItemVariants }
