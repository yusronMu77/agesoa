"use server";

/** Server actions of the validator pages. Results travel back in the URL (no one-time values here). */

import { redirect } from "next/navigation";
import { loadConfig } from "@/configs/env.config";
import { ROUTES, withQuery } from "@/configs/routes.config";
import { requireSession } from "@/features/auth/server/require-session";
import { checkboxField, textField } from "@/lib/form-data";
import { createBackend } from "@/services/backend";
import { errorDetail } from "@/services/http/fetch-json";
import { NOTE_MAX_LENGTH } from "./constants";

/** SCR-020: approve or reject a finding; the decision is recorded in the public log by trust. */
export async function submitDecision(formData: FormData) {
  const findingId = textField(formData, "finding_id");
  const token = await requireSession(ROUTES.validateFinding(findingId));
  const confidence = formData.get("confidence");
  const result = await createBackend(loadConfig(), { token }).trust.decide(findingId, {
    decision: formData.get("decision") === "reject" ? "reject" : "approve",
    note: textField(formData, "note").slice(0, NOTE_MAX_LENGTH),
    conflict: checkboxField(formData, "conflict"),
    confidence: confidence ? Number(confidence) : null,
  });
  if (!result.ok) redirect(withQuery(ROUTES.validateFinding(findingId), { error: errorDetail(result) }));
  redirect(withQuery(ROUTES.validate, { done: findingId }));
}

/** SCR-021/024: register as a validator with one role document, read by Agen Peran (the image is not stored). */
export async function registerValidator(formData: FormData) {
  const back = ROUTES.validatorRegister;
  const token = await requireSession(back);
  const file = formData.get("document");
  if (!(file instanceof File) || file.size === 0) redirect(withQuery(back, { error: "Choose a document image." }));

  const form = new FormData();
  for (const key of ["role", "field", "regency_name"]) form.set(key, textField(formData, key));
  const organizationId = textField(formData, "organization_id");
  if (organizationId) form.set("organization_id", organizationId);
  form.set("document", file, file.name || "document");

  const result = await createBackend(loadConfig(), { token }).trust.registerValidator(form);
  if (!result.ok) {
    const detail = (result.body as { detail?: unknown } | null)?.detail;
    const message =
      result.status === 415
        ? "The document must be a JPEG, PNG or WebP image."
        : result.status === 409
          ? "You are already registered."
          : detail
            ? errorDetail(result)
            : `The registration could not be processed (${result.error}).`;
    redirect(withQuery(back, { error: message }));
  }
  redirect(withQuery(back, { done: 1 }));
}
