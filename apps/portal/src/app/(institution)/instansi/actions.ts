"use server";

import { redirect } from "next/navigation";
import { loadConfig } from "@/lib/config";
import { checkOrganizationForm, type OrganizationFormState } from "@/lib/console-view";
import { errorDetail } from "@/lib/http";
import { getT } from "@/lib/i18n/server";
import { registerOrganization } from "@/lib/organizations";
import { ROUTES, signInHref } from "@/lib/routes";
import { sessionToken } from "@/lib/session";

/**
 * SCR-060 "Lanjut ke DNS": checks the form (errors near the field, entries kept, nothing in the URL: the contact
 * e-mail is private), registers the organization with trust and opens its DNS step.
 */
export async function registerOrganizationAction(
  _previous: OrganizationFormState,
  formData: FormData,
): Promise<OrganizationFormState> {
  const token = await sessionToken();
  if (!token) redirect(signInHref(`${ROUTES.institution}?daftar=1`));
  const { t } = await getT();
  const checked = checkOrganizationForm(formData);
  if (!checked.ok) {
    return {
      values: checked.values,
      errors: Object.fromEntries(Object.entries(checked.errors).map(([field, key]) => [field, t(key)])),
      formError: null,
    };
  }
  const { values } = checked;
  const result = await registerOrganization(loadConfig(), token, {
    name: values.name,
    kind: values.kind,
    domain: values.domain,
    region: { regency_name: values.regency },
    contact_email: values.contact_email || null,
  });
  if (!result.ok) {
    if (result.status === 409) return { values, errors: { domain: t("org.error.conflict") }, formError: null };
    if (result.status === 422) {
      const detail = JSON.stringify((result.body as { detail?: unknown } | null)?.detail ?? "");
      const field = detail.includes("contact_email") ? "contact_email" : "domain";
      return { values, errors: { [field]: t(field === "domain" ? "org.domainHint" : "org.error.email") }, formError: null };
    }
    return { values, errors: {}, formError: result.status === null ? t("org.error.network") : errorDetail(result) };
  }
  redirect(ROUTES.organization(result.data.organization_id));
}
