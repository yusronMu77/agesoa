/** Audit trail of a case as recorded by the case-audit service (Agen Audit). */

import type { EvidenceStatus } from "@/services/read-model/read-model.model";

export interface AuditStep {
  id: number;
  step: string;
  branch: string | null;
  content: Record<string, unknown>;
  status_label: EvidenceStatus | null;
  evidence_refs: string[];
  actor: string;
  created_at: string;
}
