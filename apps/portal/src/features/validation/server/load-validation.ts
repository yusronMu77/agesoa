import { notFound } from "next/navigation";
import { loadConfig } from "@/configs/env.config";
import { ROUTES } from "@/configs/routes.config";
import { redirectWhenSignedOut } from "@/features/auth/server/require-session";
import { createBackend } from "@/services/backend";

/** SCR-022 queue: the validator profile and the findings waiting for this validator. */
export async function loadValidationQueue(token: string) {
  const config = loadConfig();
  const { trust } = createBackend(config, { token });
  const [profile, requests] = await Promise.all([trust.getMyProfile(), trust.listValidationRequests()]);
  redirectWhenSignedOut(profile, ROUTES.validate);
  return { demoMode: config.demoMode, profile, requests };
}

export type ValidationQueueData = Awaited<ReturnType<typeof loadValidationQueue>>;

/** SCR-020 decision: the finding with its quorum, the audit trail of its case, and who is deciding. */
export async function loadFindingForDecision(token: string, findingId: string) {
  const { trust, caseAudit } = createBackend(loadConfig(), { token });
  const [profile, detail] = await Promise.all([trust.getMyProfile(), trust.getValidationRequest(findingId)]);
  if (!detail.ok && detail.status === 404) notFound();
  if (!detail.ok) return { ok: false as const, error: detail.error };
  return {
    ok: true as const,
    profile: profile.ok ? profile.data : null,
    finding: detail.data,
    trail: await caseAudit.getAuditTrail(detail.data.case_id),
  };
}

export type FindingDecisionData = Extract<Awaited<ReturnType<typeof loadFindingForDecision>>, { ok: true }>;

/** SCR-021/026 registration: the current registration (if any) and the choices of the form. */
export async function loadRegistration(token: string) {
  const config = loadConfig();
  const { trust } = createBackend(config, { token });
  const [profile, roles, newsrooms] = await Promise.all([trust.getMyProfile(), trust.listRoles(), trust.listNewsrooms()]);
  return {
    demoMode: config.demoMode,
    me: profile.ok ? profile.data : null,
    roles: roles.ok ? roles.data : [],
    newsrooms: newsrooms.ok ? newsrooms.data : [],
  };
}

export type RegistrationData = Awaited<ReturnType<typeof loadRegistration>>;
