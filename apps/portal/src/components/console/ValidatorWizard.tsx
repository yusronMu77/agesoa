"use client";

import { CircleAlert, Info, Upload } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useT } from "@/lib/i18n/client";
import { useRegistrationStep } from "./RegistrationSteps";

export interface WizardValues {
  role: string;
  field: string;
  regency: string;
  organization: string;
}

interface Option {
  value: string;
  label: string;
}

type FieldErrors = Partial<Record<"role" | "field" | "regency", string>>;

/**
 * SCR-021 (role and region) and SCR-024 (documents, reading) of the validator registration as one form: step 1 is
 * checked here before step 2 opens; "Baca dokumen" sends everything to trust, where Agen Peran reads the document.
 * Going back never clears what was filled in (TXT-REG-003).
 */
export function ValidatorWizard({
  action,
  roles,
  newsrooms,
  initial,
  initialStep,
  readError,
  signedIn,
  signInHref,
}: {
  action: (formData: FormData) => void | Promise<void>;
  roles: Option[];
  newsrooms: Option[];
  initial: WizardValues;
  initialStep: 0 | 1;
  readError: string | null;
  signedIn: boolean;
  signInHref: string;
}) {
  return (
    <form action={action} className="register-form" data-testid="validator-register-form">
      <WizardBody
        roles={roles}
        newsrooms={newsrooms}
        initial={initial}
        initialStep={initialStep}
        readError={readError}
        signedIn={signedIn}
        signInHref={signInHref}
      />
    </form>
  );
}

function WizardBody({
  roles,
  newsrooms,
  initial,
  initialStep,
  readError,
  signedIn,
  signInHref,
}: {
  roles: Option[];
  newsrooms: Option[];
  initial: WizardValues;
  initialStep: 0 | 1;
  readError: string | null;
  signedIn: boolean;
  signInHref: string;
}) {
  const t = useT();
  const { pending } = useFormStatus();
  const [step, setLocalStep] = useState<0 | 1>(initialStep);
  const guide = useRegistrationStep();
  const setStep = (next: 0 | 1) => {
    setLocalStep(next);
    guide.setStep(next);
  };
  const [errors, setErrors] = useState<FieldErrors>({});
  const [files, setFiles] = useState<{ letter: string | null; card: string | null }>({ letter: null, card: null });
  const root = useRef<HTMLDivElement>(null);
  const errorCount = Object.keys(errors).length as 0 | 1 | 2 | 3;
  const showErrors = errorCount > 0;

  const goNext = () => {
    const form = root.current?.closest("form");
    if (!form) return;
    const value = (name: string) => String((form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? "").trim();
    const next: FieldErrors = {};
    if (!value("role")) next.role = t("reg.error.role");
    if (value("field").length < 2) next.field = t("reg.error.field");
    if (value("regency_name").length < 2) next.regency = t("reg.error.regency");
    setErrors(next);
    if (Object.keys(next).length > 0) {
      const first = next.role ? "role" : next.field ? "field" : "regency_name";
      (form.elements.namedItem(first) as HTMLElement | null)?.focus();
      return;
    }
    setStep(1);
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>("h1")?.focus());
  };

  const goBack = () => {
    setStep(0);
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>("h1")?.focus());
  };

  const attachedCount = (files.letter !== null ? 1 : 0) + (files.card !== null ? 1 : 0);
  const attached = attachedCount > 0;
  const reading = pending && step === 1;
  const head =
    step === 0
      ? showErrors
        ? { title: t("reg.errorTitle"), lead: t(`reg.errorLead.${errorCount as 1 | 2 | 3}`) }
        : { title: t("reg.title"), lead: t("reg.intro") }
      : reading
        ? { title: t("reg.readingTitle"), lead: t("reg.readingLead") }
        : readError && !attached
          ? { title: t("reg.readFailedTitle"), lead: t("reg.readFailedLead") }
          : attached
            ? { title: t("reg.attachedTitle"), lead: t(`reg.attachedLead.${attachedCount as 1 | 2}`) }
            : { title: t("reg.docsTitle"), lead: t("reg.docsLead") };

  return (
    <div ref={root} className="register-view" data-step={step + 1}>
      <div className="register-head">
        <h1 tabIndex={-1}>{head.title}</h1>
        <p>{head.lead}</p>
      </div>

      {/* Step 1 (SCR-021). Hidden, not removed, while step 2 is open: the values travel with the form. */}
      <div className="register-fields" hidden={step !== 0}>
        {showErrors ? (
          <div className="callout callout--error callout--inline register-callout" role="alert">
            <p className="callout__title">
              <CircleAlert aria-hidden size={20} strokeWidth={2} />
              {t(`reg.errorCount.${errorCount as 1 | 2 | 3}`)}
            </p>
            <p>{errors.role && errors.regency && !errors.field ? t("reg.errorCalloutRoleRegion") : t("reg.errorCalloutBody")}</p>
          </div>
        ) : (
          <p className="register-hint">{t("reg.required")}</p>
        )}
        <label className="register-field">
          <span className="register-field__label">{t("reg.role")}</span>
          <select
            name="role"
            defaultValue={initial.role}
            aria-invalid={errors.role ? true : undefined}
            aria-describedby={errors.role ? "role-error" : undefined}
          >
            <option value="" disabled>
              {t("reg.choose")}
            </option>
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          {errors.role ? (
            <span className="register-field__error" id="role-error">
              {errors.role}
            </span>
          ) : null}
        </label>
        <label className="register-field">
          <span className="register-field__label">{t("reg.field")}</span>
          <input
            name="field"
            type="text"
            maxLength={120}
            defaultValue={initial.field}
            aria-invalid={errors.field ? true : undefined}
            aria-describedby={errors.field ? "field-error" : undefined}
          />
          {errors.field ? (
            <span className="register-field__error" id="field-error">
              {errors.field}
            </span>
          ) : null}
        </label>
        <label className="register-field">
          <span className="register-field__label">{t("reg.regency")}</span>
          <input
            name="regency_name"
            type="text"
            maxLength={120}
            defaultValue={initial.regency}
            aria-invalid={errors.regency ? true : undefined}
            aria-describedby={errors.regency ? "regency-error" : "regency-hint"}
          />
          {errors.regency ? (
            <span className="register-field__error" id="regency-error">
              {errors.regency}
            </span>
          ) : (
            <span className="sr-only" id="regency-hint">
              {t("reg.regencyHint")}
            </span>
          )}
        </label>
        <label className="register-field">
          <span className="register-field__label">{t("reg.newsroom")}</span>
          <select name="organization_id" defaultValue={initial.organization}>
            <option value="">{t("reg.newsroomNone")}</option>
            {newsrooms.map((n) => (
              <option key={n.value} value={n.value}>
                {n.label}
              </option>
            ))}
          </select>
        </label>
        <p className="register-hint">{t("reg.namePrivacy")}</p>
        <div className="register-actions">
          <Link href={signInHref} className="button button--ghost">
            {t("reg.back")}
          </Link>
          <button type="button" className="button register-actions__primary" onClick={goNext}>
            {t("reg.continue")}
          </button>
        </div>
      </div>

      {/* Step 2 (SCR-024): documents, then Agen Peran reads them on submit. */}
      <div className="register-fields" hidden={step !== 1}>
        {readError && !attached && !reading ? (
          <div className="callout callout--error callout--inline register-callout" role="alert" data-testid="register-error">
            <p className="callout__title">
              <CircleAlert aria-hidden size={20} strokeWidth={2} />
              {t("reg.readFailedCallout")}
            </p>
            <p>{t("reg.readFailedBody")}</p>
            {readError !== t("reg.readFailedBody") ? <p className="register-hint">{readError}</p> : null}
          </div>
        ) : null}
        <label className={`register-upload${files.letter ? " register-upload--done" : ""}${readError && !attached ? " register-upload--error" : ""}`}>
          <Upload aria-hidden size={24} strokeWidth={2} />
          <span className="register-upload__text">
            <span className="register-upload__title">{files.letter ?? t("reg.upload.letter")}</span>
            <span className="register-upload__note">
              {files.letter ? t("reg.upload.attached") : readError && !attached ? t("reg.upload.letterFailed") : t("reg.upload.letterNote")}
            </span>
          </span>
          <input
            className="register-upload__input"
            name="document"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label={t("reg.document")}
            disabled={reading}
            onChange={(e) => {
              const name = e.currentTarget.files?.[0]?.name ?? null;
              setFiles((f) => ({ ...f, letter: name }));
            }}
          />
        </label>
        <label className={`register-upload${files.card ? " register-upload--done" : ""}`}>
          <Upload aria-hidden size={24} strokeWidth={2} />
          <span className="register-upload__text">
            <span className="register-upload__title">{files.card ?? t("reg.upload.card")}</span>
            <span className="register-upload__note">{files.card ? t("reg.upload.attached") : t("reg.upload.cardNote")}</span>
          </span>
          <input
            className="register-upload__input"
            name="document_card"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label={t("reg.documentCard")}
            disabled={reading}
            onChange={(e) => {
              const name = e.currentTarget.files?.[0]?.name ?? null;
              setFiles((f) => ({ ...f, card: name }));
            }}
          />
        </label>
        <div className="callout callout--inline register-callout" role={reading ? "status" : undefined}>
          <p className="callout__title">
            <Info aria-hidden size={20} strokeWidth={2} />
            {reading ? t("reg.readingCallout") : t("reg.privateTitle")}
          </p>
          <p>{reading ? t("reg.readingCalloutBody") : t("reg.private")}</p>
        </div>
        {reading ? (
          <div className="register-skeleton" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        ) : (
          <>
            <p className="register-hint">{t("reg.invite")}</p>
            <p className="register-hint">{t("reg.roadmap")}</p>
            {signedIn ? null : <p className="register-hint register-hint--strong">{t("reg.signInFirst")}</p>}
          </>
        )}
        <div className="register-actions">
          <button type="button" className="button button--ghost" onClick={goBack} disabled={reading}>
            {t("reg.back")}
          </button>
          <button type="submit" className="button register-actions__primary" disabled={!attached || reading} aria-busy={reading || undefined}>
            {reading ? t("reg.reading") : t("reg.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
