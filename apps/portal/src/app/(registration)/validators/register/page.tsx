import { Check, CircleAlert, CircleCheck, Clock, Cpu, FileText, TriangleAlert, UserRound } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ValidatorConsole } from "@/components/console/Consoles";
import { RegistrationHead, RegistrationRow, RegistrationShell } from "@/components/console/RegistrationShell";
import { ValidatorWizard, type WizardValues } from "@/components/console/ValidatorWizard";
import { loadConfig } from "@/lib/config";
import { parseReading, type ReadingSummary, registrationView } from "@/lib/console-view";
import { errorDetail } from "@/lib/http";
import { formatDate, type Lang, type Translate } from "@/lib/i18n/core";
import type { MessageKey } from "@/lib/i18n/messages";
import { getT } from "@/lib/i18n/server";
import { ROUTES, signInHref } from "@/lib/routes";
import { sessionToken } from "@/lib/session";
import { getMyProfile, listNewsrooms, listRoles, REJECTION_TEXT, registerValidator, type ValidatorProfile } from "@/lib/trust";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("reg.meta") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const NEXT = ROUTES.validatorRegister;
const SIGN_IN = signInHref(ROUTES.validator);
/** What Agen Peran read (SCR-025), carried from the submit to the review once. */
const READING_COOKIE = "agesoa_reg_reading";

const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");

async function submit(formData: FormData) {
  "use server";
  const token = await sessionToken();
  if (!token) redirect(signInHref(NEXT));
  const { t } = await getT();
  const values = {
    role: String(formData.get("role") ?? ""),
    field: String(formData.get("field") ?? ""),
    regency: String(formData.get("regency_name") ?? ""),
    org: String(formData.get("organization_id") ?? ""),
  };
  const back = (message: string): never => {
    const query = new URLSearchParams({ step: "documents", error: message, ...values });
    redirect(`${NEXT}?${query.toString()}`);
  };
  // Agen Peran reads one document: the assignment letter when given, otherwise the worker card.
  const letter = formData.get("document");
  const card = formData.get("document_card");
  const file = letter instanceof File && letter.size > 0 ? letter : card instanceof File && card.size > 0 ? card : null;
  if (!file) back(t("reg.error.noDocument"));
  const form = new FormData();
  form.set("role", values.role);
  form.set("field", values.field);
  form.set("regency_name", values.regency);
  if (values.org) form.set("organization_id", values.org);
  form.set("document", file as File, (file as File).name || "document");
  const result = await registerValidator(loadConfig(), token, form);
  if (!result.ok) {
    const detail = (result.body as { detail?: unknown } | null)?.detail;
    if (result.status === 409) redirect(NEXT);
    back(
      result.status === null
        ? t("reg.error.network")
        : result.status === 415
        ? t("reg.error.type")
        : detail
          ? errorDetail(result)
          : t("reg.error.failed", { error: result.error }),
    );
    return;
  }
  // SCR-025: what Agen Peran read, shown once for checking before the status (short-lived, httpOnly, no name).
  const r = result.data.reading;
  const reading: ReadingSummary = {
    issuer: r.issuer,
    number: r.number,
    valid_until: r.valid_until,
    confidence: r.confidence,
  };
  (await cookies()).set(READING_COOKIE, JSON.stringify(reading), {
    httpOnly: true,
    sameSite: "lax",
    path: NEXT,
    maxAge: 15 * 60,
  });
  redirect(`${NEXT}?step=review`);
}

async function confirmReview(formData: FormData) {
  "use server";
  if (formData.get("checked") !== "on") {
    const { t } = await getT();
    redirect(`${NEXT}?step=review&error=${encodeURIComponent(t("reg.review.error"))}`);
  }
  (await cookies()).delete({ name: READING_COOKIE, path: NEXT });
  redirect(NEXT);
}

const REJECTION_KEYS = new Set(Object.keys(REJECTION_TEXT));

function rejectionText(t: Translate, reason: string | null): string {
  if (reason && REJECTION_KEYS.has(reason)) return t(`reject.${reason}` as MessageKey);
  return reason ?? "—";
}

/**
 * SCR-021 → 024 → 025 → 026, full page (no console): role and region, documents, the reading of Agen Peran, the
 * status. Anyone may open it; sending the documents needs an account (sign-in keeps `next` here).
 */
export default async function RegisterPage({ searchParams }: { searchParams: SearchParams }) {
  const token = await sessionToken();
  const config = loadConfig();
  const { lang, t } = await getT();
  const query = await searchParams;
  const [profile, roles, newsrooms] = await Promise.all([
    token ? getMyProfile(config, token) : Promise.resolve(null),
    listRoles(config),
    listNewsrooms(config),
  ]);
  const me = profile?.ok ? profile.data : null;
  const reading = parseReading((await cookies()).get(READING_COOKIE)?.value);
  const view = registrationView({
    status: me?.status ?? null,
    step: one(query.step),
    retry: one(query.retry) === "1",
    hasReading: reading !== null,
  });
  const error = one(query.error) || null;

  if (view.kind === "form") {
    const initial: WizardValues = {
      role: one(query.role),
      field: one(query.field),
      regency: one(query.regency),
      organization: one(query.org),
    };
    return (
      <RegistrationShell flow="validator" step={view.step} signInHref={signInHref(NEXT)}>
        <ValidatorWizard
          action={submit}
          roles={roles.ok ? roles.data.map((r) => ({ value: r.id, label: r.label })) : []}
          newsrooms={newsrooms.ok ? newsrooms.data.map((n) => ({ value: n.organization_id, label: n.name })) : []}
          initial={initial}
          initialStep={view.step === 1 ? 1 : 0}
          readError={error}
          signedIn={token !== null}
          signInHref={SIGN_IN}
        />
      </RegistrationShell>
    );
  }

  if (view.kind === "review" && me && reading) {
    return (
      <RegistrationShell flow="validator" step={2} signInHref={SIGN_IN}>
        <ReadingReview me={me} reading={reading} t={t} lang={lang} error={error} demo={config.demoMode} />
      </RegistrationShell>
    );
  }

  // SCR-021 in the console: an active validator reads their role and region inside the validator dashboard.
  if (me && (me.status === "active" || me.status === "probation") && one(query.status) !== "1") {
    return (
      <ValidatorConsole profile={me} section="role">
        <RoleOverview me={me} t={t} />
      </ValidatorConsole>
    );
  }

  return (
    <RegistrationShell flow="validator" step={3} signInHref={SIGN_IN}>
      {me ? <RegistrationStatus me={me} t={t} demo={config.demoMode} /> : null}
    </RegistrationShell>
  );
}

/**
 * SCR-021 "Peran dan wilayah" (console): the current role, region and organization, what Agen Peran read and the
 * steps of the application. Changing the role is not offered: trust has no endpoint for it yet.
 */
function RoleOverview({ me, t }: { me: ValidatorProfile; t: Translate }) {
  const pct = me.confidence === null ? null : Math.round(me.confidence * 100);
  const done = <span className="badge badge--ok">{t("step.done")}</span>;
  return (
    <>
      <div className="page-intro">
        <h1>{t("console.validator.nav.register")}</h1>
        <p>{t("role.intro")}</p>
      </div>
      <div className="role-grid">
        <section className="card decide-card" aria-labelledby="role-heading" data-testid="role-summary">
          <h2 id="role-heading">{t("role.current")}</h2>
          <dl className="role-summary">
            <div>
              <dt>{t("role.role")}</dt>
              <dd>{me.role_label}</dd>
            </div>
            <div>
              <dt>{t("role.regions")}</dt>
              <dd>{[me.region?.district_name, me.region?.regency_name].filter(Boolean).join(", ") || "—"}</dd>
            </div>
            <div>
              <dt>{t("role.organization")}</dt>
              <dd>{me.organization ?? t("validator.profile.independent")}</dd>
            </div>
            {me.tier ? (
              <div>
                <dt>{t("role.tier")}</dt>
                <dd>{t(`validator.tier.${me.tier}`)}</dd>
              </div>
            ) : null}
          </dl>
          <p className="footnote">{t("role.changeLater")}</p>
        </section>
        <div className="stack">
          <section className="card decide-card" aria-labelledby="role-ai-heading">
            <div className="section-title">
              <h2 id="role-ai-heading">{t("role.ai.title")}</h2>
              {pct !== null ? (
                <span className="ai-chip">
                  <Cpu aria-hidden size={16} strokeWidth={2} />
                  {t("role.ai.chip", { pct })}
                </span>
              ) : null}
            </div>
            {pct !== null ? (
              <div className="callout callout--ai callout--inline">
                <p className="callout__title">
                  <Cpu aria-hidden size={20} strokeWidth={2} />
                  {t("role.ai.proposed", { role: me.role_label })}
                </p>
                <p>{t("role.ai.proposedBody")}</p>
              </div>
            ) : (
              <p className="muted">{t("role.ai.none")}</p>
            )}
            <p className="footnote">{t("role.ai.note")}</p>
          </section>
          <section className="card decide-card" aria-labelledby="role-status-heading">
            <h2 id="role-status-heading">{t("role.status.title")}</h2>
            <ol className="status-steps">
              <li>
                <span className="status-steps__text">{t("role.status.submitted")}</span>
                {done}
              </li>
              {pct !== null ? (
                <li>
                  <span className="status-steps__text">{t("role.status.read")}</span>
                  {done}
                </li>
              ) : null}
              {me.path === "org_confirmed" ? (
                <li>
                  <span className="status-steps__text">{t("reg.status.confirmed")}</span>
                  {done}
                </li>
              ) : null}
              <li>
                <span className="status-steps__text">
                  {me.probation ? t("reg.status.probationTitle") : t("reg.status.activeTitle")}
                  {me.probation ? <span className="status-steps__sub">{t("reg.status.probationLead")}</span> : null}
                </span>
                <span className="badge badge--ok">{me.probation ? t("reg.status.probationBadge") : t("reg.status.activeBadge")}</span>
              </li>
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}

const readingDate = (lang: Lang, value: string | null) => (value ? formatDate(lang, value) : "—");

/** SCR-025: what Agen Peran read from the document; a proposal, not an approval. */
function ReadingReview({
  me,
  reading,
  t,
  lang,
  error,
  demo,
}: {
  me: ValidatorProfile;
  reading: ReadingSummary;
  t: Translate;
  lang: Lang;
  error: string | null;
  demo: boolean;
}) {
  const pct = Math.round(reading.confidence * 100);
  return (
    <form action={confirmReview} className="register-form" data-testid="registration-review">
      <div className="register-view">
        <RegistrationHead title={t("reg.review.title")} lead={t("reg.review.lead")} />
        <div className="register-fields">
          {error ? (
            <div className="callout callout--error callout--inline register-callout" role="alert">
              <p className="callout__title">
                <CircleAlert aria-hidden size={20} strokeWidth={2} />
                {error}
              </p>
            </div>
          ) : null}
          <div className="callout callout--ai callout--inline register-callout">
            <p className="callout__title">
              <Cpu aria-hidden size={20} strokeWidth={2} />
              {t("reg.review.aiTitle")}
            </p>
            <p>{t(demo ? "reg.review.confidenceSim" : "reg.review.confidence", { pct })}</p>
          </div>
          <label className="register-field">
            <span className="register-field__label">{t("reg.review.issuer")}</span>
            <input type="text" readOnly value={reading.issuer ?? "—"} />
          </label>
          <label className="register-field">
            <span className="register-field__label">{t("reg.review.number")}</span>
            <input type="text" readOnly value={reading.number ?? "—"} />
          </label>
          <label className="register-field">
            <span className="register-field__label">{t("reg.review.validUntil")}</span>
            <input type="text" readOnly value={readingDate(lang, reading.valid_until)} />
          </label>
          <ul className="register-rows">
            <RegistrationRow
              icon={<UserRound size={24} strokeWidth={1.75} />}
              title={t("reg.step1")}
              detail={[me.role_label, me.region?.regency_name].filter(Boolean).join(" · ")}
            />
          </ul>
          <label className="register-check">
            <input type="checkbox" name="checked" required />
            {t("reg.review.check")}
          </label>
          <div className="register-actions">
            <Link href={NEXT} className="button button--ghost">
              {t("reg.back")}
            </Link>
            <button type="submit" className="button register-actions__primary">
              {t("reg.review.submit")}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

/** SCR-026: where the application stands, from the validator profile trust returns. */
function RegistrationStatus({ me, t, demo }: { me: ValidatorProfile; t: Translate; demo: boolean }) {
  const roleRegion = [me.role_label, me.region?.regency_name].filter(Boolean).join(" · ");
  const submission = (
    <RegistrationRow icon={<FileText size={24} strokeWidth={1.75} />} title={t("reg.status.submission", { id: me.validator_id })} detail={roleRegion} />
  );
  // Seeded demo validators were never read by Agen Peran: no confidence, no reading line.
  const read =
    me.confidence === null ? null : (
      <RegistrationRow
        icon={<Check size={24} strokeWidth={2} />}
        title={t("reg.status.read")}
        detail={t(demo ? "reg.status.readConfidenceSim" : "reg.status.readConfidence", { pct: Math.round(me.confidence * 100) })}
      />
    );
  const signIn = (
    <Link href={SIGN_IN} className="button button--ghost">
      {t("reg.status.signIn")}
    </Link>
  );

  if (me.status === "awaiting_confirmation") {
    return (
      <section className="register-view" data-testid="registration-status" aria-labelledby="status-heading">
        <div className="register-head">
          <h1 id="status-heading">{t("reg.status.awaitingTitle")}</h1>
          <p>{t("reg.status.waitingOrg")}</p>
        </div>
        <div className="register-fields">
          <p>
            <span className="badge badge--warn register-badge">{t("reg.status.awaitingBadge")}</span>
          </p>
          <div className="callout callout--warning callout--inline register-callout">
            <p className="callout__title">
              <TriangleAlert aria-hidden size={20} strokeWidth={2} />
              {t("reg.status.awaitingCallout")}
            </p>
            <p>{t("reg.status.awaitingBody", { org: me.organization ?? t("reg.status.yourNewsroom") })}</p>
          </div>
          <ul className="register-rows">
            {submission}
            {read}
            <RegistrationRow icon={<Clock size={24} strokeWidth={1.75} />} title={t("reg.status.waitingOrg")} detail={t("reg.status.waitingOrgSub")} />
          </ul>
          <div className="register-actions">
            {signIn}
            <Link href={NEXT} className="button register-actions__primary">
              {t("reg.status.check")}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (me.status === "rejected") {
    return (
      <section className="register-view" data-testid="registration-status" aria-labelledby="status-heading">
        <div className="register-head">
          <h1 id="status-heading">{t("reg.status.rejectedTitle")}</h1>
          <p>{t("reg.status.rejectedLead")}</p>
        </div>
        <div className="register-fields">
          <p>
            <span className="badge badge--error register-badge">{t("reg.status.rejectedBadge")}</span>
          </p>
          <div className="callout callout--error callout--inline register-callout">
            <p className="callout__title">
              <TriangleAlert aria-hidden size={20} strokeWidth={2} />
              {t("reg.status.rejectedCallout")}
            </p>
            <p>
              {me.rejection_reason === "expired"
                ? t("reg.status.rejectedBody.expired")
                : t("reg.status.rejectedBody", { reason: rejectionText(t, me.rejection_reason) })}
            </p>
          </div>
          <ul className="register-rows">
            {submission}
            {read}
            <RegistrationRow
              icon={<TriangleAlert size={24} strokeWidth={1.75} />}
              title={t("reg.status.rejectedRow")}
              detail={t("reg.status.rejectedRowSub")}
            />
          </ul>
          <div className="register-actions">
            {signIn}
            <Link href={`${NEXT}?retry=1`} className="button register-actions__primary">
              {t("reg.status.retry")}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="register-view" data-testid="registration-status" aria-labelledby="status-heading">
      <div className="register-head">
        <h1 id="status-heading">{me.probation ? t("reg.status.probationTitle") : t("reg.status.activeTitle")}</h1>
        <p>{me.probation ? t("reg.status.probationLead") : t("reg.status.activeLead")}</p>
      </div>
      <div className="register-fields">
        <p>
          <span className="badge badge--ok register-badge">{me.probation ? t("reg.status.probationBadge") : t("reg.status.activeBadge")}</span>
        </p>
        <div className="callout callout--success callout--inline register-callout">
          <p className="callout__title">
            <CircleCheck aria-hidden size={20} strokeWidth={2} />
            {t("reg.status.acceptedCallout")}
          </p>
          <p>{me.probation ? t("reg.status.acceptedProbationBody") : t("reg.status.acceptedBody")}</p>
        </div>
        <ul className="register-rows">
          {submission}
          {read}
          {me.path === "org_confirmed" ? (
            <RegistrationRow
              icon={<CircleCheck size={24} strokeWidth={1.75} />}
              title={t("reg.status.confirmed")}
              detail={me.probation ? t("reg.status.confirmedProbation") : t("reg.status.confirmedSub")}
            />
          ) : null}
        </ul>
        <div className="register-actions">
          {signIn}
          <Link href={ROUTES.validator} className="button register-actions__primary">
            {t("reg.status.openQueue")}
          </Link>
        </div>
      </div>
    </section>
  );
}
