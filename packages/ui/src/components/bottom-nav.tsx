import type { ComponentType, HTMLAttributes, ReactNode } from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cn } from "@agesoa/ui/lib/utils"

/** Penpot `NavItem mobile` bar: the Witness tab bar (Lapor, Laporan saya, Pertanyaan, Bantuan) fixed to the bottom. */
function BottomNav({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <nav
      data-slot="bottom-nav"
      className={cn("flex items-stretch justify-between gap-1 bg-card px-2 py-2", className)}
      {...props}
    />
  )
}

type BottomNavItemProps = useRender.ComponentProps<"button"> & {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  label: ReactNode
  /** Small count next to the icon (open audit questions). */
  badge?: number
}

/** One tab: icon over a label, 48 px touch target; the open tab is `aria-current="page"` (the pill repeats it). */
function BottomNavItem({ icon: Icon, label, badge, className, render, ...props }: BottomNavItemProps) {
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(
          "relative flex min-h-12 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-xs font-medium text-muted-foreground no-underline transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:bg-[var(--ag-color-brand-primary-subtle)] aria-[current=page]:text-primary",
          className
        ),
        children: (
          <>
            <span className="relative">
              <Icon className="size-6" aria-hidden />
              {badge ? (
                <span
                  data-slot="bottom-nav-badge"
                  className="absolute -top-1 -right-2.5 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.6875rem] leading-4 font-semibold text-primary-foreground"
                >
                  {badge}
                </span>
              ) : null}
            </span>
            {label}
          </>
        ),
      },
      props
    ),
    render,
    state: { slot: "bottom-nav-item" },
  })
}

export { BottomNav, BottomNavItem }
