/**
 * Public questions about the findings, answered by Agen Report in the transparency service from validated findings
 * only. The answer comes with the findings it used (references); the portal never answers on its own.
 */

import type { PortalConfig } from "./config";
import { type FetchOptions, type FetchResult, fetchJson } from "./http";
import type { Lang } from "./i18n/core";
import type { EvidenceStatus } from "./readmodel";

export const QUESTION_MIN = 3;
export const QUESTION_MAX = 300;
/** A model answer takes longer than a read; the service itself falls back to an extractive answer after 20 s. */
export const ASK_TIMEOUT_MS = 25_000;

export interface AnswerReference {
  finding_id: string;
  case_id: string | null;
  /** The finding's public statement in the answer's language. */
  statement: string;
  status: EvidenceStatus | null;
  region_name: string | null;
  validated_at: string;
  /** Approving validator decisions (no validator reference). */
  approvals: number;
  synthetic: boolean;
}

export interface QuestionAnswer {
  answer: string;
  /** Validated findings the answer uses, best first; empty when none answers the question. */
  references: AnswerReference[];
  /** "model:<name>" (the agent's answer, checked by the service) or "extractive" (its fallback). */
  method: string;
}

/** The question from `?q=`, whitespace collapsed; null when it is missing or not 3–300 characters. */
export function parseQuestion(raw: string | string[] | undefined): string | null {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.replace(/\s+/g, " ").trim();
  return value && value.length >= QUESTION_MIN && value.length <= QUESTION_MAX ? value : null;
}

export function askQuestion(
  config: PortalConfig,
  question: string,
  lang: Lang,
  options?: FetchOptions,
): Promise<FetchResult<QuestionAnswer>> {
  return fetchJson<QuestionAnswer>(`${config.serviceUrls.transparency}/v1/questions`, {
    timeoutMs: ASK_TIMEOUT_MS,
    ...options,
    method: "POST",
    body: { question, lang },
  });
}
