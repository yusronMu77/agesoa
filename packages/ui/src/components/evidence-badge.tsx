import type { ComponentProps } from "react"
import { CircleHelpIcon, FileTextIcon, ShieldCheckIcon } from "lucide-react"
import { Badge } from "@agesoa/ui/components/badge"

export type EvidenceStatus = "alleged" | "supported" | "proven"

const ICON = { alleged: CircleHelpIcon, supported: FileTextIcon, proven: ShieldCheckIcon }

/**
 * Evidence status of a finding (Penpot `Badge status bukti`): Dugaan / Didukung bukti / Terbukti. The label comes
 * from the app's copy, so the component stays free of any locale; the icon repeats the status for people who cannot
 * tell the colours apart and adds no text.
 */
function EvidenceBadge({
  status,
  children,
  ...props
}: { status: EvidenceStatus } & Omit<ComponentProps<typeof Badge>, "variant">) {
  const Icon = ICON[status]
  return (
    <Badge variant={status} {...props}>
      <Icon aria-hidden="true" data-icon="inline-start" />
      {children}
    </Badge>
  )
}

export { EvidenceBadge }
