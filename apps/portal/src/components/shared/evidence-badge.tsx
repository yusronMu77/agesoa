import { Badge } from "@agesoa/ui/components/badge";
import { EvidenceBadge as SharedEvidenceBadge } from "@agesoa/ui/components/evidence-badge";
import type { EvidenceStatus } from "@/services/read-model/read-model.model";

export const EVIDENCE_LABEL: Record<EvidenceStatus, string> = {
  alleged: "Alleged",
  supported: "Supported by evidence",
  proven: "Proven",
};

export function EvidenceBadge({ status }: { status: EvidenceStatus | null }) {
  if (!status) return <Badge variant="neutral">No status yet</Badge>;
  return (
    <SharedEvidenceBadge status={status} data-testid="evidence-status">
      {EVIDENCE_LABEL[status]}
    </SharedEvidenceBadge>
  );
}
