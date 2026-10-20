"use client";

import { KeyRound } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useActionState, useState } from "react";
import { ConfirmSubmit } from "@/components/console/ConfirmSubmit";
import { CopyButton } from "@/components/console/CopyButton";
import { rotateApiKey, saveWebhook, testEvent } from "@/app/(institution)/instansi/[organizationId]/actions";
import { registerOrganizationAction } from "@/app/(institution)/instansi/actions";
import { useT } from "@/lib/i18n/client";
import type { Subscription } from "@/lib/institutions";

/**
 * Agency dashboard forms (SCR-062). One-time values (webhook secret, API key) come back as action state and are
 * kept only in this component: they are never in the URL and a reload does not show them again.
 */

/** PRV-secret-once / PRV-key-once: the value once, "Salin" and "Sudah disimpan" (hides it; a reload never shows it). */
function OneTimeValue({ testId, label, body, value }: { testId: string; label: string; body: string; value: string }) {
  const t = useT();
  const [saved, setSaved] = useState(false);
  if (saved) return null;
  return (
    <div className="callout callout--warning callout--inline one-time" role="status">
      <p className="callout__title">
        <KeyRound aria-hidden size={18} strokeWidth={2} />
        {label}
      </p>
      <pre className="txt-record one-time__value" data-testid={testId}>
        {value}
      </pre>
      <p>{body}</p>
      <div className="one-time__actions">
        <CopyButton value={value} label={t("int.copy")} copiedLabel={t("int.copied")} testId={`${testId}-copy`} />
        <button type="button" className="button button--secondary" onClick={() => setSaved(true)}>
          {t("int.savedIt")}
        </button>
      </div>
    </div>
  );
}

function ErrorText({ error }: { error: string }) {
  return (
    <p className="callout callout--error callout--inline" role="alert">
      {error}
    </p>
  );
}

export function WebhookForm({
  organizationId,
  subscription,
  formId,
}: {
  organizationId: string;
  subscription: Subscription | null;
  /** The save button lives outside the form (next to "Kirim event uji") and points here with `form=`. */
  formId: string;
}) {
  const t = useT();
  const [state, action, pending] = useActionState(saveWebhook, null);
  return (
    <form id={formId} action={action} className="form int-form" data-testid="webhook-form" aria-busy={pending || undefined}>
      <input type="hidden" name="organization_id" value={organizationId} />
      <label>
        {t("int.webhookUrl")}
        <input type="url" name="webhook_url" required defaultValue={subscription?.webhook_url ?? ""} placeholder="https://" />
      </label>
      <details className="int-filters">
        <summary>{t("int.filters")}</summary>
        <label>
          {t("int.regionCode")}
          <input type="text" name="region_code" maxLength={32} defaultValue={subscription?.region_code ?? ""} />
        </label>
        <label>
          {t("int.categoryField")}
          <input type="text" name="category" maxLength={48} defaultValue={subscription?.category ?? ""} />
        </label>
        <p className="field-hint field-hint--top">{t("int.filtersHint")}</p>
      </details>
      {subscription ? (
        <div className="secret-box secret-box--row">
          <span className="secret-box__text">
            <span className="secret-box__label">{t("int.secretShort")}</span>
            <span className="secret-box__value">whsec_••••••••••••••••</span>
          </span>
          <ConfirmSubmit
            className="button button--secondary button--compact"
            testId="rotate-secret"
            title={t("int.rotateDialog.title")}
            body={t("int.rotateDialog.body")}
            confirmLabel={t("int.rotateSecret")}
            cancelLabel={t("decide.confirm.cancel")}
            pendingLabel={t("login.wait")}
          >
            {t("int.rotateSecret")}
          </ConfirmSubmit>
        </div>
      ) : null}
      {state?.ok === false ? <ErrorText error={state.error} /> : null}
      {state?.ok ? <OneTimeValue testId="webhook-secret" label={t("int.secretLabel")} body={t("int.oneTime")} value={state.secret} /> : null}
    </form>
  );
}

export function TestEventForm({ organizationId }: { organizationId: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(testEvent, null);
  return (
    <form action={action} className="test-event-form" aria-busy={pending || undefined}>
      <input type="hidden" name="organization_id" value={organizationId} />
      <div>
        <button type="submit" className="button" disabled={pending} data-testid="send-test-event">
          {t("int.testEvent")}
        </button>
      </div>
      {state?.ok === false ? <ErrorText error={state.error} /> : null}
      {state?.ok ? (
        <p className="callout callout--success callout--inline" role="status" data-testid="test-event-result">
          {t("int.testQueued", { id: state.delivery_id })}
        </p>
      ) : null}
    </form>
  );
}

export function ApiKeyForm({
  organizationId,
  hasKey,
  children,
}: {
  organizationId: string;
  hasKey: boolean;
  /** The current key (prefix only) under the heading. */
  children?: ReactNode;
}) {
  const t = useT();
  const [state, action, pending] = useActionState(rotateApiKey, null);
  return (
    <form action={action} className="api-key-form" aria-busy={pending || undefined}>
      <input type="hidden" name="organization_id" value={organizationId} />
      <div className="section-title">
        <h2 id="apikey-heading">{t("int.apiKey")}</h2>
        <ConfirmSubmit
          className="button button--secondary button--compact"
          testId="create-api-key"
          confirmTestId="create-api-key-confirm"
          title={t("int.keyDialog.title")}
          body={hasKey ? `${t("int.keyDialog.body")} ${t("int.apiKeyRotate")}` : t("int.keyDialog.body")}
          confirmLabel={t("int.apiKeyCreate")}
          cancelLabel={t("decide.confirm.cancel")}
          pendingLabel={t("login.wait")}
        >
          {t("int.apiKeyCreate")}
        </ConfirmSubmit>
      </div>
      {children}
      <p className="field-hint field-hint--top">{t("int.oneTimeKey")}</p>
      {state?.ok === false ? <ErrorText error={state.error} /> : null}
      {state?.ok ? <OneTimeValue testId="api-key-once" label={t("int.apiKeyOnce")} body={t("int.oneTimeKeyBody")} value={state.api_key} /> : null}
    </form>
  );
}

/**
 * SCR-060 "Daftarkan organisasi" (registration shell, agesoa-uiux instansi-data / instansi-data-error): name, kind,
 * domain, the signed-in admin e-mail (read only), service region, optional private contact e-mail, the authority
 * declaration (starts unticked), "Kembali" + "Lanjut ke DNS". Errors stay next to their field; entries are kept.
 */
export function OrganizationRegisterForm({
  adminEmail,
  backHref,
  initialKind,
}: {
  adminEmail: string | null;
  backHref: string;
  initialKind: "newsroom" | "agency";
}) {
  const t = useT();
  const [state, action, pending] = useActionState(registerOrganizationAction, null);
  const values = state?.values;
  const errors = state?.errors ?? {};
  const fieldErrors = Object.keys(errors);
  const domainOnly = fieldErrors.length === 1 && fieldErrors[0] === "domain";
  const head =
    fieldErrors.length === 0
      ? { title: t("org.title"), lead: t("org.intro") }
      : domainOnly
        ? { title: t("org.errorTitle"), lead: t("org.errorLead") }
        : { title: t("org.errorTitleForm"), lead: t("org.errorLeadForm") };
  const invalid = (field: string) => (field in errors ? true : undefined);
  const describe = (field: string, hint?: string) => (field in errors ? `${field}-error` : hint);
  const fieldError = (field: keyof typeof errors) =>
    errors[field] ? (
      <span className="register-field__error" id={`${field}-error`}>
        {errors[field]}
      </span>
    ) : null;
  return (
    // Keyed by the result so a returned state re-applies the kept entries as default values.
    <form
      key={state ? JSON.stringify(state.values) : "new"}
      action={action}
      className="register-form"
      data-testid="register-form"
      noValidate
      aria-busy={pending || undefined}
    >
      <section className="register-view" aria-labelledby="org-form-heading">
        <div className="register-head">
          <h1 id="org-form-heading">{head.title}</h1>
          <p>{head.lead}</p>
        </div>
        <div className="register-fields">
          {state?.formError ? (
            <div className="callout callout--error callout--inline register-callout" role="alert" data-testid="register-error">
              <p className="callout__title">{state.formError}</p>
            </div>
          ) : (
            <p className="register-hint">{t("org.required")}</p>
          )}
          <label className="register-field">
            <span className="register-field__label">{t("org.name")}</span>
            <input
              name="name"
              type="text"
              maxLength={200}
              autoComplete="organization"
              defaultValue={values?.name ?? ""}
              aria-invalid={invalid("name")}
              aria-describedby={describe("name")}
            />
            {fieldError("name")}
          </label>
          <label className="register-field">
            <span className="register-field__label">{t("org.kind")}</span>
            <select name="kind" defaultValue={values?.kind ?? initialKind}>
              <option value="agency">{t("orgKind.short.agency")}</option>
              <option value="newsroom">{t("orgKind.short.newsroom")}</option>
            </select>
          </label>
          <label className="register-field">
            <span className="register-field__label">{t("org.domain")}</span>
            <input
              name="domain"
              type="text"
              maxLength={253}
              autoComplete="off"
              spellCheck={false}
              defaultValue={values?.domain ?? ""}
              aria-invalid={invalid("domain")}
              aria-describedby={describe("domain", "domain-hint")}
            />
            {errors.domain ? fieldError("domain") : (
              <span className="field-hint field-hint--top" id="domain-hint">
                {t("org.domainHint")}
              </span>
            )}
          </label>
          {adminEmail ? (
            <label className="register-field">
              <span className="register-field__label">{t("org.adminEmail")}</span>
              <input
                type="email"
                className="register-field__readonly"
                readOnly
                value={adminEmail}
                aria-describedby="admin-email-hint"
                data-testid="admin-email"
              />
              <span className="field-hint field-hint--top" id="admin-email-hint">
                {t("org.adminEmailHint")}
              </span>
            </label>
          ) : null}
          <label className="register-field">
            <span className="register-field__label">{t("org.regency")}</span>
            <input
              name="regency"
              type="text"
              maxLength={120}
              defaultValue={values?.regency ?? ""}
              aria-invalid={invalid("regency")}
              aria-describedby={describe("regency")}
            />
            {fieldError("regency")}
          </label>
          <label className="register-field">
            <span className="register-field__label">{t("org.contactEmail")}</span>
            <input
              name="contact_email"
              type="email"
              maxLength={254}
              autoComplete="email"
              defaultValue={values?.contact_email ?? ""}
              aria-invalid={invalid("contact_email")}
              aria-describedby={describe("contact_email", "contact-email-hint")}
              data-testid="contact-email"
            />
            {errors.contact_email ? fieldError("contact_email") : (
              <span className="field-hint field-hint--top" id="contact-email-hint">
                {t("org.contactEmailHint")}
              </span>
            )}
          </label>
          <label className="register-check">
            <input
              type="checkbox"
              name="authority"
              defaultChecked={values?.authority ?? false}
              aria-invalid={invalid("authority")}
              aria-describedby={describe("authority")}
            />
            {t("org.authority")}
          </label>
          {fieldError("authority")}
          <div className="register-actions">
            <Link href={backHref} className="button button--ghost">
              {t("reg.back")}
            </Link>
            <button type="submit" className="button register-actions__primary" disabled={pending} aria-busy={pending || undefined}>
              {pending ? t("login.wait") : t("org.submit")}
            </button>
          </div>
        </div>
      </section>
    </form>
  );
}
