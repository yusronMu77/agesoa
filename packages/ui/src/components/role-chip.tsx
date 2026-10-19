import type { HTMLAttributes } from "react"
import { cn } from "@agesoa/ui/lib/utils"

export type Role = "warga" | "agen-ai" | "validator" | "instansi" | "publik" | "operator" | "sistem"

const TONE: Record<Role, string> = {
  warga: "bg-[var(--ag-color-role-warga)] text-[var(--ag-color-role-warga-stroke)]",
  "agen-ai": "bg-[var(--ag-color-role-agen-ai)] text-[var(--ag-color-role-agen-ai-stroke)]",
  validator: "bg-[var(--ag-color-role-validator)] text-[var(--ag-color-role-validator-stroke)]",
  instansi: "bg-[var(--ag-color-role-instansi)] text-[var(--ag-color-role-instansi-stroke)]",
  publik: "bg-[var(--ag-color-role-publik)] text-[var(--ag-color-role-publik-stroke)]",
  operator: "bg-[var(--ag-color-role-operator)] text-foreground",
  sistem: "bg-[var(--ag-color-role-sistem)] text-[var(--ag-color-role-sistem-stroke)]",
}

/** Penpot `Role chip`: who acted or who is signed in; the role is always written, the colour only repeats it. */
function RoleChip({ role, className, ...props }: HTMLAttributes<HTMLSpanElement> & { role: Role }) {
  return (
    <span
      data-slot="role-chip"
      data-role={role}
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-medium whitespace-nowrap [&>svg]:size-4",
        TONE[role],
        className
      )}
      {...props}
    />
  )
}

export { RoleChip }
