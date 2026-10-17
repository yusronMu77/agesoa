/**
 * Public documents of the read model (field allow-list of services/transparency/read_model.py). Firestore holds
 * them; only the transparency service writes, everyone may read.
 */

export type EvidenceStatus = "alleged" | "supported" | "proven";

export interface PublicRegion {
  regency_code: string | null;
  regency_name: string;
  district_code: string | null;
  district_name: string | null;
}

export interface PublicCase {
  case_id: string;
  synthetic: boolean;
  domain: string | null;
  category: string | null;
  status: string | null;
  evidence_status: string | null;
  max_finding_status: EvidenceStatus | null;
  region: PublicRegion | null;
  report_count: number;
  signal_count: number;
  updated_at: string | null;
  /** Latest follow-up per institution (absent in documents projected before SCR-043). */
  follow_ups?: PublicFollowUp[];
  /** Right of reply statements, oldest first. */
  replies?: PublicReply[];
  /** Audit report of the case (SCR-041), null until the Report agent (or the demo fallback) wrote one. */
  audit_report?: PublicAuditReport | null;
}

export interface PublicRootCause {
  statement: string;
  status: EvidenceStatus;
  /** How many evidence items back the statement (the items themselves are not public). */
  evidence_count: number;
}

export interface PublicAuditReport {
  audit_report_id: string;
  summary: string;
  root_causes: PublicRootCause[];
  recommendations: string[];
  created_at: string;
}

export type FollowUpStatus = "received" | "in_progress" | "done";

export interface PublicFollowUp {
  organization_id: string;
  status: FollowUpStatus;
  note: string | null;
  internal_ticket?: string | null;
  updated_at: string;
}

export interface PublicReply {
  reply_id: string;
  organization_id: string;
  body: string;
  attachments?: { name: string; url: string }[];
  received_at: string;
}

export interface PublicValidationDecision {
  tier: string;
  decision: string;
  role_label?: string | null;
  regency_name?: string | null;
}

export interface PublicFinding {
  finding_id: string;
  synthetic: boolean;
  case_id: string | null;
  domain: string | null;
  statement: string | null;
  status: EvidenceStatus | null;
  evidence_count: number;
  region: PublicRegion | null;
  validation: {
    outcome: "approved" | "rejected";
    completed_at: string;
    decisions: PublicValidationDecision[];
  } | null;
}

export interface PublicDistrict {
  district_code: string;
  district_name: string;
  regency_code: string;
  regency_name: string;
  /** GeoJSON Polygon / MultiPolygon as JSON text (Firestore has no nested arrays). */
  geometry: string;
  synthetic: boolean;
}

export interface PublicStats {
  cases_by_status: Record<string, number>;
  findings_by_status: Record<string, number>;
  validations_by_outcome: Record<string, number>;
  reports_received: number;
  signals_received: number;
  log_length: number;
  log_head_hash: string;
  updated_at: string;
}
