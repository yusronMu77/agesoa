import { CircleCheck, CircleX, Cpu } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PendingButton } from "@/components/console/PendingButton";
import { EvidenceBadge } from "@/components/EvidenceBadge";
import { loadConfig } from "@/lib/config";
import { auditStepView, isMachineActor, regionName } from "@/lib/console-view";
import { errorDetail } from "@/lib/http";
import { formatDateTime, type Translate } from "@/lib/i18n/core";
import { getT } from "@/lib/i18n/server";
import { sessionToken } from "@/lib/session";
import { type AuditStep, decide, getAuditTrail, getMyProfile, getValidationRequest } from "@/lib/trust";
import { Localized } from "@/components/Localized";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("decide.meta") };
}

type Params = Promise<{ findingId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function submitDecision(formData: FormData) {
  "use server";
  const token = await sessionToken();
  const findingId = String(formData.get("finding_id"));
  if (!token) redirect(`/login?next=/validate/${encodeURIComponent(findingId)}`);
  const decision = formData.get("decision") === "reject" ? "reject" : "approve";
  const result = await decide(loadConfig(), token, findingId, {
    decision,
    note: String(formData.get("note") ?? "").slice(0, 4000),
    conflict: formData.get("conflict") === "on",
    confidence: formData.get("confidence") ? Number(formData.get("confidence")) : null,
  });
  if (!result.ok) {
    redirect(`/validate/${encodeURIComponent(findingId)}?error=${encodeURIComponent(errorDetail(result))}`);
  }
  redirect(`/validate?done=${encodeURIComponent(findingId)}`);
}

function AiLabel({ t }: { t: Translate }) {
  return (
    <span className="ai-label">
      <Cpu aria-hidden size={14} strokeWidth={2} />
      {t("common.ai.result")}
    </span>
  );
}

/** SCR-020: the basis of the finding on the left (AI results marked), the decision panel on the right. */
export default async function ValidateFindingPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const findingId = decodeURIComponent((await params).findingId);
  const token = await sessionToken();
  if (!token) redirect(`/login?next=/validate/${encodeURIComponent(findingId)}`);
  const config = loadConfig();
  const { lang, t } = await getT();
  const [profile, detail] = await Promise.all([getMyProfile(config, token), getValidationRequest(config, token, findingId)]);
  if (!detail.ok && detail.status === 404) notFound();
  if (!detail.ok) {
    return <p className="callout callout--error">{t("decide.unavailable", { error: detail.error })}</p>;
  }
  const f = detail.data;
  const trail = await getAuditTrail(config, token, f.case_id);
  const error = (await searchParams).error;
  const closed = f.outcome !== null || f.my_decision !== null;
  const steps = trail.ok ? trail.data : [];
  const hypotheses = steps.filter((s) => s.step === "hypothesis");
  const region = regionName(f);
  const outcome = t(`outcome.${f.quorum.outcome}`);

  return (
    <>
      <nav aria-label={t("console.breadcrumb")} className="breadcrumb">
        <ol>
          <li>
            <Link href="/validate">{t("console.validator.nav.queue")}</Link>
          </li>
          <li aria-current="page">{f.finding_id}</li>
        </ol>
      </nav>
      <div className="decide-head">
        <EvidenceBadge status={f.status_label} lang={lang} />
        <AiLabel t={t} />
      </div>
      <h1 className="decide-title" data-testid="finding-statement">
        <Localized lang={lang} plain={f.statement} i18n={f.statement_i18n} />
      </h1>

      <div className="decide-layout">
        <div className="stack">
          <section className="card" aria-labelledby="basis-heading">
            <div className="section-title">
              <h2 id="basis-heading">{t("decide.basis")}</h2>
            </div>
            <p className="muted">{t("decide.basisIntro")}</p>
            <dl className="facts">
              <div>
                <dt>{t("decide.case")}</dt>
                <dd>
                  <code>{f.case_id}</code>
                </dd>
              </div>
              <div>
                <dt>{t("decide.domain")}</dt>
                <dd>{f.domain}</dd>
              </div>
              <div>
                <dt>{t("decide.region")}</dt>
                <dd>{region ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("decide.received")}</dt>
                <dd>
                  <time dateTime={f.received_at}>{formatDateTime(lang, f.received_at)}</time>
                </dd>
              </div>
              <div>
                <dt>{t("decide.roles")}</dt>
                <dd>{f.required_roles.join(", ") || t("decide.rolesAny")}</dd>
              </div>
            </dl>
            <h3 className="sub-heading">{t("decide.evidence")}</h3>
            {f.evidence_refs.length > 0 ? (
              <ul className="evidence-list" data-testid="evidence-refs">
                {f.evidence_refs.map((ref) => (
                  <li key={ref}>{ref}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t("decide.evidenceNone")}</p>
            )}
            {hypotheses.length > 0 ? (
              <>
                <h3 className="sub-heading">{t("decide.hypotheses")}</h3>
                <ol className="basis-list" data-testid="hypotheses">
                  {hypotheses.map((s) => (
                    <TrailItem key={s.id} step={s} t={t} lang={lang} hypothesis />
                  ))}
                </ol>
              </>
            ) : null}
          </section>

          <section className="card" aria-labelledby="trail-heading">
            <h2 id="trail-heading">{t("decide.trail")}</h2>
            {!trail.ok ? (
              <p className="callout callout--error">{t("decide.trailError", { error: trail.error })}</p>
            ) : steps.length === 0 ? (
              <p className="muted" data-testid="trail-empty">
                {t("decide.trailEmpty")}
              </p>
            ) : (
              <ol className="basis-list audit-trail" data-testid="audit-trail">
                {steps.map((s) => (
                  <TrailItem key={s.id} step={s} t={t} lang={lang} />
                ))}
              </ol>
            )}
          </section>
        </div>

        <section className="card decide-panel" aria-labelledby="decide-heading">
          <h2 id="decide-heading">{t("decide.panel")}</h2>
          {profile.ok ? (
            <p className="muted small">
              {t("decide.as", { role: profile.data.role_label })}
              {profile.data.tier ? ` · ${t("validator.profile.tier", { tier: t(`validator.tier.${profile.data.tier}`) })}` : ""}
            </p>
          ) : null}
          {typeof error === "string" ? (
            <p className="callout callout--error" role="alert" data-testid="decision-error">
              {error}
            </p>
          ) : null}
          <p className="quorum-line">
            <span className={`badge ${f.quorum.outcome === "approved" ? "badge--ok" : f.quorum.outcome === "rejected" ? "badge--error" : "badge--warn"}`} data-testid="quorum-status">
              {t("decide.quorum", { outcome, a: f.quorum.approvals, r: f.quorum.rejections })}
            </span>
          </p>
          <p className="muted small">{f.quorum.reason}</p>
          {closed ? (
            <p className="callout" data-testid="decision-closed">
              {f.my_decision
                ? t("decide.already", { decision: t(`decision.${f.my_decision}`) })
                : t("decide.closed", { outcome: f.outcome ? t(`outcome.${f.outcome}`) : outcome })}
            </p>
          ) : (
            <form action={submitDecision} className="form" data-testid="decision-form">
              <input type="hidden" name="finding_id" value={f.finding_id} />
              <fieldset className="decision-options">
                <legend>{t("decide.choice")}</legend>
                <label className="decision-option">
                  <CircleCheck aria-hidden size={22} strokeWidth={2} className="decision-option__icon--approve" />
                  <span className="decision-option__text">
                    {t("decide.approve")}
                    <span className="decision-option__hint">{t("decide.approveHint")}</span>
                  </span>
                  <input type="radio" name="decision" value="approve" required />
                </label>
                <label className="decision-option">
                  <CircleX aria-hidden size={22} strokeWidth={2} className="decision-option__icon--reject" />
                  <span className="decision-option__text">
                    {t("decide.reject")}
                    <span className="decision-option__hint">{t("decide.rejectHint")}</span>
                  </span>
                  <input type="radio" name="decision" value="reject" />
                </label>
              </fieldset>
              <label>
                {t("decide.note")}
                <textarea name="note" rows={4} maxLength={4000} />
              </label>
              <label>
                {t("decide.confidence")}
                <select name="confidence" defaultValue="">
                  <option value="">{t("decide.confidence.none")}</option>
                  <option value="0.9">{t("decide.confidence.high")}</option>
                  <option value="0.7">{t("decide.confidence.medium")}</option>
                  <option value="0.5">{t("decide.confidence.low")}</option>
                </select>
              </label>
              <label>
                <input type="checkbox" name="conflict" /> {t("decide.conflict")}
              </label>
              <PendingButton pendingLabel={t("decide.submitting")}>{t("decide.submit")}</PendingButton>
              <p className="footnote">{t("decide.footnote")}</p>
            </form>
          )}
        </section>
      </div>
    </>
  );
}

function TrailItem({ step, t, lang, hypothesis = false }: { step: AuditStep; t: Translate; lang: "id" | "en"; hypothesis?: boolean }) {
  const view = auditStepView(step.content, lang);
  return (
    <li className={`basis-item${hypothesis ? " basis-item--hypothesis" : ""}`}>
      <div className="basis-item__head">
        <span>
          {step.step}
          {step.branch ? ` · ${t("decide.branch", { branch: step.branch })}` : ""} · {step.actor} ·{" "}
          <time dateTime={step.created_at}>{formatDateTime(lang, step.created_at)}</time>
        </span>
        <span className="finding-head">
          {isMachineActor(step.actor) ? <AiLabel t={t} /> : null}
          {step.status_label ? <EvidenceBadge status={step.status_label} lang={lang} /> : null}
        </span>
      </div>
      {view.title ? <p className="basis-item__title">{view.title}</p> : null}
      {view.facts.length > 0 ? (
        <dl className="facts">
          {view.facts.map((fact) => (
            <div key={fact.key}>
              <dt>{fact.key.replace(/_/g, " ")}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {step.evidence_refs.length > 0 ? <p className="cell-finding__meta">{step.evidence_refs.join(", ")}</p> : null}
      <details>
        <summary>{t("decide.trailRaw")}</summary>
        <pre className="mono">{JSON.stringify(step.content, null, 2)}</pre>
      </details>
    </li>
  );
}
