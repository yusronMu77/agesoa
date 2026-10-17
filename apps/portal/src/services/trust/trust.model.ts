/** Data of the trust service: validators, validation requests and quorum, organizations and their staff. */

import type { EvidenceStatus } from "@/services/read-model/read-model.model";

// --- Validators and validation (SCR-020, SCR-022) -----------------------------------------------------------

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

export type Decision = "approve" | "reject";

export interface DecisionInput {
  decision: Decision;
  note: string;
  conflict: boolean;
  confidence: number | null;
}

export interface DecisionResult {
  finding_id: string;
  decision: Decision;
  counted: boolean;
  quorum_reached: boolean;
  outcome: "approved" | "rejected" | null;
  quorum: QuorumStatus;
}

// --- Validator registration (SCR-021, SCR-024–026) -----------------------------------------------------------

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

// --- Organizations (SCR-060, SCR-064–065) and staff confirmation (SCR-061) ----------------------------------

export type OrganizationKind = "newsroom" | "agency";
export type OrganizationStatus = "awaiting_dns" | "verified" | "rejected";

export interface Organization {
  organization_id: string;
  name: string;
  kind: OrganizationKind;
  domain: string;
  region: { regency_code?: string | null; regency_name?: string } | null;
  status: OrganizationStatus;
  txt_record: string;
  verified_at: string | null;
  synthetic: boolean;
  created_at: string;
}

export type DnsResult = "verified" | "already_verified" | "no_record" | "token_mismatch" | "dns_error";

export interface DnsCheck {
  result: DnsResult;
  detail: string;
  organization: Organization;
}

export interface OrganizationInput {
  name: string;
  kind: OrganizationKind;
  domain: string;
  region: { regency_name: string };
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

export type StaffDecision = "confirm" | "reject";

export interface StaffDecisionResult {
  validator_id: string;
  status: string;
  tier: string | null;
}
