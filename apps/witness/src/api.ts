/** Clients for the ingestion and case-audit services (types mirror their openapi.json). */

import { bearerToken } from "./auth";
import type { WitnessConfig } from "./config";

export interface Label {
  en: string;
  id: string;
}

export type FieldType = "string" | "string_list" | "datetime" | "date" | "integer" | "enum";

export interface PackField {
  id: string;
  type: FieldType;
  required: boolean;
  label: Label;
  hint?: Label;
  options?: string[];
}

export interface PackSummary {
  id: string;
  name: Label;
}

export interface PackDocument {
  id: string;
  name: Label;
  categories: { id: string; label: Label }[];
  report_fields: PackField[];
  rules: { id: string; label: Label }[];
  evidence_tips: Label[];
  intake_hints?: { fields?: Record<string, { vocabulary?: Record<string, string[]> }> };
}

export interface District {
  regency_code: string | null;
  regency_name: string;
  district_code: string | null;
  district_name: string | null;
  synthetic?: boolean;
}

export type EvidenceKind = "photo" | "audio" | "screenshot";

export interface Evidence {
  evidence_id: string;
  kind: EvidenceKind;
  media_type: string;
  sha256: string;
  size_bytes: number;
  metadata_removed: boolean;
}

export type FieldValue = string | number | string[];

export interface Report {
  id: string;
  status: "draft" | "submitted";
  domain: string;
  category: string | null;
  narrative: string | null;
  fields: Record<string, FieldValue>;
  missing_required: string[];
  rule_results: { rule_id: string; violated: boolean | null; detail: string }[];
  evidence_status: {
    status: "available" | "likely_lost" | "unknown";
    deadline_at: string | null;
    max_finding_status: string;
  } | null;
  evidence_tips: Label[];
  evidence: Evidence[];
  region: District | null;
  shared_post: { id: string; url: string; platform: string; excerpt: string | null; reports: number } | null;
  intake: {
    model: string;
    category: string | null;
    fields: Record<string, FieldValue>;
    transcript: string | null;
    drafted_at: string;
  } | null;
  synthetic: boolean;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
}

export interface SharedPostInput {
  url: string;
  excerpt?: string | null;
}

export interface ReportCreate {
  domain: string;
  narrative?: string | null;
  district_code?: string | null;
  shared_post?: SharedPostInput | null;
}

export interface ReportPatch {
  domain?: string;
  category?: string | null;
  fields?: Record<string, FieldValue | null>;
  narrative?: string | null;
  district_code?: string | null;
  shared_post?: SharedPostInput | null;
}

export class ApiError extends Error {
  constructor(
    /** HTTP status, or null when the service could not be reached. */
    readonly status: number | null,
    readonly detail: string,
  ) {
    super(status === null ? `unreachable: ${detail}` : `HTTP ${status}: ${detail}`);
    this.name = "ApiError";
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

abstract class ServiceClient {
  constructor(
    private readonly config: WitnessConfig,
    private readonly baseUrl: string,
    private readonly fetchImpl: FetchLike,
  ) {}

  protected async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${bearerToken(this.config.appEnv)}`,
    };
    let payload: BodyInit | undefined;
    if (body instanceof FormData) {
      payload = body;
    } else if (body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, { method, headers, body: payload });
    } catch (error) {
      throw new ApiError(null, error instanceof Error ? error.message : String(error));
    }
    const text = await response.text();
    const json = text ? safeJson(text) : null;
    if (!response.ok) {
      throw new ApiError(response.status, errorDetail(json) ?? (text.slice(0, 200) || response.statusText));
    }
    return json as T;
  }
}

export class IngestionClient extends ServiceClient {
  constructor(config: WitnessConfig, fetchImpl: FetchLike = (input, init) => fetch(input, init)) {
    super(config, config.ingestionUrl, fetchImpl);
  }

  pack(id: string) {
    return this.request<PackDocument>("GET", `/v1/domain-packs/${encodeURIComponent(id)}`);
  }

  packs() {
    return this.request<PackSummary[]>("GET", "/v1/domain-packs");
  }

  districts() {
    return this.request<District[]>("GET", "/v1/regions/districts");
  }

  /** The position is only used to find the district; the service does not store or log it. */
  resolveDistrict(lat: number, lon: number) {
    return this.request<District>("POST", "/v1/regions/resolve", { lat, lon });
  }

  createReport(body: ReportCreate) {
    return this.request<Report>("POST", "/v1/reports", body);
  }

  getReport(id: string) {
    return this.request<Report>("GET", `/v1/reports/${id}`);
  }

  patchReport(id: string, body: ReportPatch) {
    return this.request<Report>("PATCH", `/v1/reports/${id}`, body);
  }

  uploadEvidence(id: string, kind: EvidenceKind, file: Blob, filename: string) {
    const form = new FormData();
    form.append("kind", kind);
    form.append("file", file, filename);
    return this.request<Evidence>("POST", `/v1/reports/${id}/evidence`, form);
  }

  runIntake(id: string) {
    return this.request<Report>("POST", `/v1/reports/${id}/intake`);
  }

  submit(id: string) {
    return this.request<Report>("POST", `/v1/reports/${id}/submit`);
  }
}

/** An audit question waiting for this reporter (case-audit `GET /v1/witness/questions`). */
export interface WitnessQuestion {
  question_id: string;
  case_id: string;
  text: Label;
  asked_at: string;
  synthetic: boolean;
}

export class CaseAuditClient extends ServiceClient {
  constructor(config: WitnessConfig, fetchImpl: FetchLike = (input, init) => fetch(input, init)) {
    super(config, config.caseAuditUrl, fetchImpl);
  }

  /** The questions waiting for this device. Anonymous: the service matches a pseudonym of the device id. */
  questions() {
    return this.request<WitnessQuestion[]>("GET", "/v1/witness/questions");
  }

  answer(caseId: string, questionId: string, answer: string) {
    return this.request<unknown>("POST", `/v1/cases/${encodeURIComponent(caseId)}/witness-answers`, {
      question_id: questionId,
      answer,
    });
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** FastAPI errors: {"detail": "text"} or {"detail": [{"loc": [...], "msg": "..."}]}. */
export function errorDetail(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("detail" in body)) return null;
  const detail = (body as { detail: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        const item = d as { loc?: unknown[]; msg?: string };
        return [item.loc?.slice(1).join("."), item.msg].filter(Boolean).join(": ");
      })
      .join("; ");
  }
  return null;
}
