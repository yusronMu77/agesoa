import { CircleCheck, Clock, Cpu, FileText, Info, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PendingButton } from "@/components/console/PendingButton";
import { type GuideStep, progressText, StepGuide } from "@/components/console/StepGuide";
import { loadConfig } from "@/lib/config";
import { registrationSteps } from "@/lib/console-view";
import { errorDetail } from "@/lib/http";
import type { Translate } from "@/lib/i18n/core";
import type { MessageKey } from "@/lib/i18n/messages";
import { getT } from "@/lib/i18n/server";
import { sessionToken } from "@/lib/session";
import { getMyProfile, listNewsrooms, listRoles, REJECTION_TEXT, registerValidator, type ValidatorProfile } from "@/lib/trust";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("reg.meta") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const NEXT = "/validators/register";

async function submit(formData: FormData) {
  "use server";
  const token = await sessionToken();
  if (!token) redirect(`/login?next=${NEXT}`);
  const { t } = await getT();
  const file = formData.get("document");
  if (!(file instanceof File) || file.size === 0) redirect(`${NEXT}?error=${encodeURIComponent(t("reg.error.noDocument"))}`);
  const form = new FormData();
  for (const key of ["role", "field", "regency_name"]) form.set(key, String(formData.get(key) ?? ""));
  const org = String(formData.get("organization_id") ?? "");
  if (org) form.set("organization_id", org);
  form.set("document", file, file.name || "document");
  const result = await registerValidator(loadConfig(), token, form);
  if (!result.ok) {
    const detail = (result.body as { detail?: unknown } | null)?.detail;
    const message =
      result.status === 415
        ? t("reg.error.type")
        : result.status === 409
          ? t("reg.error.already")
          : detail
            ? errorDetail(result)
            : t("reg.error.failed", { error: result.error });
    redirect(`${NEXT}?error=${encodeURIComponent(message)}`);
  }
  redirect(`${NEXT}?done=1`);
}

const REJECTION_KEYS = new Set(Object.keys(REJECTION_TEXT));

function rejectionText(t: Translate, reason: string | null): string {
  if (reason && REJECTION_KEYS.has(reason)) return t(`reject.${reason}` as MessageKey);
  return reason ?? "—";
}

/** SCR-021 → 024 → 025 → 026 over the existing registration: one form (role, region, document), then the status. */
export default async function RegisterPage({ searchParams }: { searchParams: SearchParams }) {
  const token = await sessionToken();
  if (!token) redirect(`/login?next=${NEXT}`);
  const config = loadConfig();
  const { t } = await getT();
  const [profile, roles, newsrooms] = await Promise.all([getMyProfile(config, token), listRoles(config), listNewsrooms(config)]);
  const { error } = await searchParams;
  const me = profile.ok ? profile.data : null;
  const states = registrationSteps(me?.status ?? null);
  const steps: GuideStep[] = [
    { label: t("reg.step1"), state: states[0] },
    { label: t("reg.step2"), state: states[1] },
    { label: t("reg.step3"), state: states[2], hint: states[2] === "next" ? t("reg.step3.hint") : undefined },
    { label: t("reg.step4"), state: states[3] },
  ];
  const showForm = !me || me.status === "rejected";

  return (
    <div className="steps-layout">
      <StepGuide
        title={t("reg.guide.title")}
        intro={t("reg.guide.intro")}
        steps={steps}
        stateText={{ done: t("step.done"), current: t("step.current"), next: t("step.next") }}
        progress={progressText(steps, (n, total) => t("step.progress", { n, total }))}
        foot={{ title: t("reg.guide.privacyTitle"), body: t("reg.guide.privacy") }}
        ariaLabel={t("reg.guide.aria")}
      />

      <div className="steps-main">
        <div className="page-intro">
          <h1>{t("reg.title")}</h1>
          <p>{t("reg.intro")}</p>
        </div>

        {me ? <RegistrationStatus me={me} t={t} /> : null}

        {typeof error === "string" ? (
          <p className="callout callout--error" role="alert" data-testid="register-error">
            {error}
          </p>
        ) : null}

        {showForm ? (
          <form action={submit} className="card form" data-testid="validator-register-form">
            <p className="field-hint field-hint--top">
              {t("reg.required")}
            </p>
            <fieldset className="form-section">
              <legend className="form-section__title">1. {t("reg.section1")}</legend>
              <label>
                {t("reg.role")}
                <select name="role" required defaultValue="">
                  <option value="" disabled>
                    {t("reg.choose")}
                  </option>
                  {roles.ok
                    ? roles.data.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))
                    : null}
                </select>
              </label>
              <label>
                {t("reg.field")}
                <input name="field" type="text" required minLength={2} maxLength={120} placeholder={t("reg.fieldPlaceholder")} />
              </label>
              <label>
                {t("reg.regency")}
                <input name="regency_name" type="text" required minLength={2} maxLength={120} aria-describedby="regency-hint" />
              </label>
              <p className="field-hint" id="regency-hint">
                {t("reg.regencyHint")}
              </p>
              <label>
                {t("reg.newsroom")}
                <select name="organization_id" defaultValue="">
                  <option value="">{t("reg.newsroomNone")}</option>
                  {newsrooms.ok
                    ? newsrooms.data.map((n) => (
                        <option key={n.organization_id} value={n.organization_id}>
                          {n.name}
                        </option>
                      ))
                    : null}
                </select>
              </label>
              <p className="field-hint">{t("reg.namePrivacy")}</p>
            </fieldset>

            <hr className="form-divider" />

            <fieldset className="form-section">
              <legend className="form-section__title">2. {t("reg.section2")}</legend>
              <label>
                {t("reg.document")}
                <input
                  name="document"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  required
                  aria-describedby="document-hint"
                />
              </label>
              <p className="field-hint" id="document-hint">
                {t("reg.documentHint")}
              </p>
              <div className="callout callout--inline">
                <p className="callout__title">
                  <Info aria-hidden size={18} strokeWidth={2} />
                  {t("reg.privateTitle")}
                </p>
                <p>{t("reg.private")}</p>
              </div>
              <div className="callout callout--ai callout--inline">
                <p className="callout__title">
                  <Cpu aria-hidden size={18} strokeWidth={2} />
                  {t("common.ai.result")} · Agen Peran
                </p>
                <p>{t("reg.aiNote")}</p>
              </div>
              <p className="field-hint field-hint--top">
                {t("reg.roadmap")}
              </p>
            </fieldset>

            <div className="actions actions--end">
              <PendingButton pendingLabel={t("reg.reading")}>{t("reg.submit")}</PendingButton>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}

/** SCR-026: where the application stands, from the validator profile trust returns. */
function RegistrationStatus({ me, t }: { me: ValidatorProfile; t: Translate }) {
  const submission = (
    <li>
      <FileText aria-hidden size={20} strokeWidth={2} />
      <span>
        <strong>{t("reg.status.submission", { id: me.validator_id })}</strong>
        <span>
          {me.role_label}
          {me.region?.regency_name ? ` · ${me.region.regency_name}` : ""}
          {me.organization ? ` · ${me.organization}` : ""}
        </span>
      </span>
    </li>
  );
  // Seeded demo validators were never read by Agen Peran: no confidence, no reading line.
  const reading =
    me.confidence === null ? null : (
    <li>
      <Cpu aria-hidden size={20} strokeWidth={2} />
      <span>
        <strong>{t("reg.status.read")}</strong>
        <span>{t("reg.status.readConfidence", { pct: Math.round(me.confidence * 100) })}</span>
      </span>
    </li>
  );

  if (me.status === "awaiting_confirmation") {
    return (
      <section className="card status-card" data-testid="registration-status" aria-labelledby="status-heading">
        <h2 id="status-heading">{t("reg.status.awaitingTitle")}</h2>
        <p>
          <span className="badge badge--warn">{t("reg.status.awaitingBadge")}</span>
        </p>
        <div className="callout callout--warning">
          <p className="callout__title">
            <TriangleAlert aria-hidden size={18} strokeWidth={2} />
            {t("reg.status.awaitingCallout")}
          </p>
          <p>{t("reg.status.awaitingBody", { org: me.organization ?? t("reg.status.yourNewsroom") })}</p>
        </div>
        <ul className="status-list">
          {submission}
          {reading}
          <li>
            <Clock aria-hidden size={20} strokeWidth={2} />
            <span>
              <strong>{t("reg.status.waitingOrg")}</strong>
              <span>{t("reg.status.waitingOrgSub")}</span>
            </span>
          </li>
        </ul>
        <div className="actions actions--end">
          <Link href={NEXT} className="button">
            {t("reg.status.check")}
          </Link>
        </div>
      </section>
    );
  }

  if (me.status === "rejected") {
    return (
      <section className="card status-card" data-testid="registration-status" aria-labelledby="status-heading">
        <h2 id="status-heading">{t("reg.status.rejectedTitle")}</h2>
        <p>
          <span className="badge badge--error">{t("reg.status.rejectedBadge")}</span>
        </p>
        <div className="callout callout--error">
          <p>
            <strong>{t("reg.status.rejectedCallout")}</strong>{" "}
            {t("reg.status.rejectedBody", { reason: rejectionText(t, me.rejection_reason) })}
          </p>
        </div>
        <ul className="status-list">
          {submission}
          {reading}
        </ul>
      </section>
    );
  }

  const tier = me.tier ? t(`validator.tier.${me.tier}`) : "—";
  return (
    <section className="card status-card" data-testid="registration-status" aria-labelledby="status-heading">
      <h2 id="status-heading">{me.probation ? t("reg.status.probationTitle") : t("reg.status.activeTitle")}</h2>
      <p>
        <span className="badge badge--ok">{me.probation ? t("reg.status.probationBadge") : t("reg.status.activeBadge")}</span>
      </p>
      <div className="callout callout--success">
        <p className="callout__title">
          <CircleCheck aria-hidden size={18} strokeWidth={2} />
          {t("reg.status.acceptedCallout")}
        </p>
        <p>
          {t("reg.status.acceptedBody", {
            role: me.role_label,
            tier,
            probation: me.probation ? t("reg.status.acceptedProbation") : "",
          })}
        </p>
      </div>
      <ul className="status-list">
        {submission}
        {reading}
        {me.path === "org_confirmed" ? (
          <li>
            <CircleCheck aria-hidden size={20} strokeWidth={2} />
            <span>
              <strong>{t("reg.status.confirmed")}</strong>
              <span>{t("reg.status.confirmedSub")}</span>
            </span>
          </li>
        ) : null}
      </ul>
      <div className="actions actions--end">
        <Link href="/validate" className="button">
          {t("reg.status.openQueue")}
        </Link>
      </div>
    </section>
  );
}
