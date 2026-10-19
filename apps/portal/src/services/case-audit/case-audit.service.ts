/** Signed-in calls to case-audit: the audit trail a validator reads before deciding. */

import { type ApiClient, segment } from "@/services/http/api-client";
import type { AuditStep } from "./case-audit.model";

export function createCaseAuditService(client: ApiClient) {
  return {
    getAuditTrail: (caseId: string) => client.get<AuditStep[]>(`/v1/cases/${segment(caseId)}/audit-trail`),
  };
}

export type CaseAuditService = ReturnType<typeof createCaseAuditService>;
