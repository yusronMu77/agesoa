import { Badge } from "@agesoa/ui/components/badge";
import type { EvidenceStatus } from "@/services/read-model/read-model.model";

export const EVIDENCE_LABEL: Record<EvidenceStatus, string> = {
  alleged: "Alleged",
  supported: "Supported by evidence",
  proven: "Proven",
};

/** Evidence status of a finding (the legend on the home page explains each level). AI never delivers a verdict. */
export function EvidenceBadge({ status }: { status: EvidenceStatus | null }) {
  if (!status) return <Badge variant="neutral">No status yet</Badge>;
  return (
    <Badge variant={status} data-testid="evidence-status">
      {EVIDENCE_LABEL[status]}
    </Badge>
  );
}
