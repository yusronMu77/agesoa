"use server";

/**
 * Server actions of the organization pages. Registration, DNS check and staff decisions redirect with the result
 * in the URL; the agency integration actions (SCR-062) return their one-time secret / API key as action state.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadConfig } from "@/configs/env.config";
import { ROUTES, withQuery } from "@/configs/routes.config";
import { requireSession } from "@/features/auth/server/require-session";
import { optionalField, textField } from "@/lib/form-data";
import { createBackend } from "@/services/backend";
import { errorDetail } from "@/services/http/fetch-json";
import type { ApiKeyState, TestEventState, WebhookState } from "./types";

/** The organization of the submitted form, the session token, and the page to come back to. */
async function context(formData: FormData) {
  const id = textField(formData, "organization_id");
  const path = ROUTES.organization(id);
  const token = await requireSession(path);
  return { id, path, backend: createBackend(loadConfig(), { token }) };
}

// --- Registration and DNS verification (SCR-060, SCR-064–065) -------------------------------------------------

export async function registerOrganization(formData: FormData) {
  const token = await requireSession(ROUTES.organizations);
  const result = await createBackend(loadConfig(), { token }).trust.registerOrganization({
    name: textField(formData, "name"),
    kind: formData.get("kind") === "agency" ? "agency" : "newsroom",
    domain: textField(formData, "domain"),
    region: { regency_name: textField(formData, "regency") },
  });
  if (!result.ok) {
    const message =
      result.status === 409
        ? "This domain is already registered."
        : result.status === 422
          ? "Check the fields: the domain must be a domain name you control (e.g. newsroom.example.org)."
          : errorDetail(result);
    redirect(withQuery(ROUTES.organizations, { error: message }));
  }
  redirect(ROUTES.organization(result.data.organization_id));
}

export async function checkDomain(formData: FormData) {
  const { id, path, backend } = await context(formData);
  const result = await backend.trust.checkDns(id);
  redirect(withQuery(path, { check: result.ok ? result.data.result : "dns_error" }));
}

// --- Staff confirmation by a verified newsroom (SCR-061) ------------------------------------------------------

export async function decideStaffCandidate(formData: FormData) {
  const { id, path, backend } = await context(formData);
  const decision = formData.get("decision") === "confirm" ? "confirm" : "reject";
  await backend.trust.decideStaff(id, textField(formData, "validator_id"), decision);
  redirect(withQuery(path, { staff: decision }));
}

// --- Agency integration (SCR-062) -----------------------------------------------------------------------------

export async function saveWebhook(_previous: WebhookState, formData: FormData): Promise<WebhookState> {
  const { id, path, backend } = await context(formData);
  const webhookUrl = optionalField(formData.get("webhook_url"));
  if (!webhookUrl) return { ok: false, error: "Enter the webhook URL." };
  const result = await backend.delivery.saveSubscription(id, {
    webhook_url: webhookUrl,
    region_code: optionalField(formData.get("region_code")),
    category: optionalField(formData.get("category")),
  });
  if (!result.ok) {
    return {
      ok: false,
      error: result.status === 422 ? `Invalid webhook URL: ${errorDetail(result)}` : `Not saved (${errorDetail(result)}).`,
    };
  }
  revalidatePath(path);
  return { ok: true, secret: result.data.secret, webhook_url: result.data.subscription.webhook_url };
}

export async function rotateApiKey(_previous: ApiKeyState, formData: FormData): Promise<ApiKeyState> {
  const { id, path, backend } = await context(formData);
  const result = await backend.delivery.createApiKey(id);
  if (!result.ok) return { ok: false, error: `No key created (${errorDetail(result)}).` };
  revalidatePath(path);
  return { ok: true, api_key: result.data.api_key, prefix: result.data.prefix };
}

export async function sendTestEvent(_previous: TestEventState, formData: FormData): Promise<TestEventState> {
  const { id, path, backend } = await context(formData);
  const result = await backend.delivery.sendTestEvent(id);
  if (!result.ok) {
    return {
      ok: false,
      error: result.status === 409 ? "Save a webhook first." : `Test event not sent (${errorDetail(result)}).`,
    };
  }
  revalidatePath(path);
  return { ok: true, delivery_id: result.data.delivery_id };
}
