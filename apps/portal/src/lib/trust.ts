/** Signed-in validator calls to trust (validation) and case-audit (audit trail). The token comes from the session. */

import type { PortalConfig } from "./config";
import { type FetchResult, fetchJson } from "./http";
import type { EvidenceStatus } from "./readmodel";

export interface ValidatorProfile {
  validator_id: string;
  role: string;
  role_label: string;
  tier: "high" | "medium" | null;
  status: string;
  organization: string | null;
  region: { regency_name?: string; district_name?: string | null } | null;
  synthetic: boolean;
}

export interface QuorumStatus {
  outcome: "approved" | "rejected" | "pending";
  reason: string;
  approvals: number;
  rejections: number;
}

export interface ValidationRequest {
  finding_id: string;
  case_id: string;
  domain: string;
  statement: string;
  status_label: EvidenceStatus;
  required_roles: string[];
  evidence_refs: string[];
  outcome: "approved" | "rejected" | null;
  synthetic: boolean;
  received_at: string;
  completed_at: string | null;
}

export interface ValidationDetail extends ValidationRequest {
  quorum: QuorumStatus;
  my_decision: "approve" | "reject" | null;
}

export interface DecisionResult {
  finding_id: string;
  decision: "approve" | "reject";
  counted: boolean;
  quorum_reached: boolean;
  outcome: "approved" | "rejected" | null;
  quorum: QuorumStatus;
}

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

const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

export function getMyProfile(config: PortalConfig, token: string): Promise<FetchResult<ValidatorProfile>> {
  return fetchJson(`${config.serviceUrls.trust}/v1/validators/me`, bearer(token));
}

export function listValidationRequests(config: PortalConfig, token: string): Promise<FetchResult<ValidationRequest[]>> {
  return fetchJson(`${config.serviceUrls.trust}/v1/validation-requests`, bearer(token));
}

export function getValidationRequest(
  config: PortalConfig,
  token: string,
  findingId: string,
): Promise<FetchResult<ValidationDetail>> {
  return fetchJson(`${config.serviceUrls.trust}/v1/validation-requests/${encodeURIComponent(findingId)}`, bearer(token));
}

export function decide(
  config: PortalConfig,
  token: string,
  findingId: string,
  body: { decision: "approve" | "reject"; note: string; conflict: boolean },
): Promise<FetchResult<DecisionResult>> {
  return fetchJson(`${config.serviceUrls.trust}/v1/validation-requests/${encodeURIComponent(findingId)}/decisions`, {
    ...bearer(token),
    method: "POST",
    body,
  });
}

export function getAuditTrail(config: PortalConfig, token: string, caseId: string): Promise<FetchResult<AuditStep[]>> {
  return fetchJson(`${config.serviceUrls["case-audit"]}/v1/cases/${encodeURIComponent(caseId)}/audit-trail`, bearer(token));
}
