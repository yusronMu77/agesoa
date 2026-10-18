/** Signed-in validator calls to trust (validation) and case-audit (audit trail). The token comes from the session. */

import type { PortalConfig } from "./config";
import { type FetchResult, fetchJson } from "./http";
import type { EvidenceStatus } from "./readmodel";
import type { LocalizedText } from "./localized";

export interface ValidatorProfile {
  validator_id: string;
  role: string;
  role_label: string;
  tier: "high" | "medium" | null;
  status: string;
  organization: string | null;
  region: { regency_name?: string; district_name?: string | null } | null;
  synthetic: boolean;
  path: string | null;
  probation: boolean;
  confidence: number | null;
  rejection_reason: string | null;
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
  /** Per language when the producer wrote it; `statement` stays the source of truth. */
  statement_i18n?: LocalizedText | null;
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
  body: { decision: "approve" | "reject"; note: string; conflict: boolean; confidence: number | null },
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

// --- validator registration (SCR-021) and staff confirmation (SCR-061) ----------------------------------------

export interface RoleOption {
  id: string;
  label: string;
}

export interface NewsroomOption {
  organization_id: string;
  name: string;
  regency_name: string | null;
}

export interface Registration {
  validator_id: string;
  status: "awaiting_confirmation" | "probation" | "rejected";
  path: "self_declared" | "org_confirmed";
  tier: "high" | "medium" | null;
  reason: string | null;
  reading: {
    document_type: string;
    name: string | null;
    position: string | null;
    issuer: string | null;
    number: string | null;
    valid_until: string | null;
    confidence: number;
    anomalies: string[];
  };
}

export interface StaffCandidate {
  validator_id: string;
  role: string;
  role_label: string;
  name: string | null;
  position: string | null;
  document_type: string | null;
  confidence: number | null;
  requested_at: string;
}

export function listRoles(config: PortalConfig): Promise<FetchResult<RoleOption[]>> {
  return fetchJson(`${config.serviceUrls.trust}/v1/validators/roles`);
}

export function listNewsrooms(config: PortalConfig): Promise<FetchResult<NewsroomOption[]>> {
  return fetchJson(`${config.serviceUrls.trust}/v1/organizations/newsrooms`);
}

export function registerValidator(config: PortalConfig, token: string, form: FormData): Promise<FetchResult<Registration>> {
  // Agen Peran reads the document with Gemini: allow it time (retries + fallback model).
  return fetchJson(`${config.serviceUrls.trust}/v1/validators/registrations`, {
    ...bearer(token),
    method: "POST",
    form,
    timeoutMs: 90_000,
  });
}

export function listStaff(config: PortalConfig, token: string, organizationId: string): Promise<FetchResult<StaffCandidate[]>> {
  return fetchJson(`${config.serviceUrls.trust}/v1/organizations/${encodeURIComponent(organizationId)}/staff`, bearer(token));
}

export function decideStaff(
  config: PortalConfig,
  token: string,
  organizationId: string,
  validatorId: string,
  decision: "confirm" | "reject",
): Promise<FetchResult<{ validator_id: string; status: string; tier: string | null }>> {
  return fetchJson(
    `${config.serviceUrls.trust}/v1/organizations/${encodeURIComponent(organizationId)}/staff/${encodeURIComponent(validatorId)}`,
    { ...bearer(token), method: "POST", body: { decision } },
  );
}

/** Plain-language reason codes of a rejected registration. */
export const REJECTION_TEXT: Record<string, string> = {
  expired: "the document has expired",
  issuer_mismatch: "the document was not issued by the organization you named",
  audited_party: "a government agency cannot confirm validators (it may be the audited party)",
  low_confidence: "the document could not be read with enough confidence",
  unreadable: "the document could not be read",
  not_confirmed: "the newsroom did not confirm you as staff",
};
