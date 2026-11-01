import { Check, CircleCheck, CircleHelp, CircleX, Cpu, FileText, Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ConfirmSubmit } from "@/components/console/ConfirmSubmit";
import { ConsoleContext } from "@/components/console/ConsoleContext";
import { DecisionNote } from "@/components/console/DecisionNote";
import { ValidatorConsole } from "@/components/console/Consoles";
import { EvidenceBadge } from "@/components/EvidenceBadge";
import { Localized } from "@/components/Localized";
import { loadConfig } from "@/lib/config";
import {
  auditStepView,
  type DecisionValue,
  deadlineView,
  decisionChoices,
  isMachineActor,
  parseConfidence,
  parseDecision,
  regionName,
} from "@/lib/console-view";
import { loadDomainPacks, packName } from "@/lib/domainpacks";
import { errorDetail } from "@/lib/http";
import { formatDate, formatDateTime, type Lang, type Translate } from "@/lib/i18n/core";
import { getT } from "@/lib/i18n/server";
import { ROUTES, signInHref } from "@/lib/routes";
import { sessionToken } from "@/lib/session";
import { type AuditStep, decide, getAuditTrail, getMyProfile, getValidationRequest } from "@/lib/trust";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("decide.meta") };
}

type Params = Promise<{ findingId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Approvals from different organizations that make a quorum (trust quorum.MIN_ORGANIZATIONS). */
const QUORUM_SIZE = 2;

async function submitDecision(formData: FormData) {
  "use server";
  const token = await sessionToken();
  const findingId = String(formData.get("finding_id"));
  const back = ROUTES.validatorFinding(findingId);
  if (!token) redirect(signInHref(back));
  // TXT-VAL-023/024: the "no conflict of interest" declaration is required and never ticked for the validator.
  if (formData.get("no_conflict") !== "on") {
    const { t } = await getT();
    redirect(`${back}?error=${encodeURIComponent(t("decide.error.conflict"))}`);
  }
  const decision = parseDecision(formData.get("decision"));
  const note = String(formData.get("note") ?? "").slice(0, 4000);
  if (decision === null || (decision === "needs_evidence" && note.trim() === "")) {
    const { t } = await getT();
    redirect(`${back}?error=${encodeURIComponent(t(decision === null ? "decide.error.choice" : "decide.error.note"))}`);
  }
  const result = await decide(loadConfig(), token, findingId, {
    decision,
    note,
    conflict: false,
    confidence: parseConfidence(formData.get("confidence")),
  });
  if (!result.ok) {
    redirect(`${back}?error=${encodeURIComponent(errorDetail(result))}`);
  }
  redirect(`${ROUTES.validator}?done=${encodeURIComponent(findingId)}&decision=${decision}`);
}

/** SCR-020: the basis of the finding on the left (AI results marked), the decision panel on the right. */
export default async function ValidateFindingPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const findingId = decodeURIComponent((await params).findingId);
  const token = await sessionToken();
  if (!token) redirect(signInHref(ROUTES.validatorFinding(findingId)));
  const config = loadConfig();
  const { lang, t } = await getT();
  const [profile, detail] = await Promise.all([getMyProfile(config, token), getValidationRequest(config, token, findingId)]);
  const me = profile.ok ? profile.data : null;
  if (!detail.ok && detail.status === 404) notFound();
  if (!detail.ok) {
    return (
      <ValidatorConsole profile={me} section="queue">
        <p className="callout callout--error">{t("decide.unavailable", { error: detail.error })}</p>
      </ValidatorConsole>
    );
  }
  const f = detail.data;
  const [trail, packs] = await Promise.all([getAuditTrail(config, token, f.case_id), loadDomainPacks(config, [f.domain])]);
  const error = (await searchParams).error;
  const choices = decisionChoices(f.my_decision, f.outcome !== null);
  const closed = choices.length === 0;
  const askedEvidence = !closed && f.my_decision === "needs_evidence";
  const steps = trail.ok ? trail.data : [];
  const hypotheses = steps.filter((s) => s.step === "hypothesis");
  const region = regionName(f);
  const domainName = packName(packs, f.domain, lang);
  const outcome = t(`outcome.${f.quorum.outcome}`);
  const approvals = Math.min(f.quorum.approvals, QUORUM_SIZE);

  const topbar = (
    <ConsoleContext
      action={ROUTES.validator}
      label={t("console.context.label")}
      applyLabel={t("console.context.apply")}
      hint={t("console.context.hint")}
      selects={[
        {
          name: "domain",
          label: t("console.context.issueType"),
          value: f.domain,
          options: [
            { value: f.domain, label: domainName },
            { value: "", label: t("console.context.issueType.all") },
          ],
        },
        {
          name: "region",
          label: t("console.context.region"),
          value: region ?? "",
          options: [
            ...(region ? [{ value: region, label: region }] : []),
            { value: "", label: t("console.context.region.all") },
          ],
        },
      ]}
    />
  );

  return (
    <ValidatorConsole profile={me} section="queue" context={topbar}>
      <nav aria-label={t("console.breadcrumb")} className="breadcrumb">
        <ol>
          <li>
            <Link href={ROUTES.validator}>{t("console.validator.nav.queue")}</Link>
          </li>
          <li aria-current="page">{f.finding_id}</li>
        </ol>
      </nav>
      <div className="decide-head">
        <EvidenceBadge status={f.status_label} lang={lang} />
        <DueLine deadline={f.deadline_at ?? null} received={f.received_at} t={t} lang={lang} />
      </div>
      <h1 className="decide-title" data-testid="finding-statement">
        <Localized lang={lang} plain={f.statement} i18n={f.statement_i18n} />
      </h1>

      <div className="decide-layout">
        <div className="stack">
          <section className="card decide-card" aria-labelledby="basis-heading">
            <div className="section-title">
              <h2 id="basis-heading">{t("decide.basis")}</h2>
              <span className="ai-chip">
                <Cpu aria-hidden size={16} strokeWidth={2} />
                {t("common.ai.result")}
              </span>
            </div>
            <p className="decide-basis">{t("decide.basisIntro")}</p>
            <p className="decide-facts">
              {t("decide.case")} <code>{f.case_id}</code> · {domainName} · {region ?? "—"} ·{" "}
              {t("decide.roles")}: {f.required_roles.join(", ") || t("decide.rolesAny")}
            </p>
            <h3 className="sub-heading">{t("decide.evidenceCount", { n: f.evidence_refs.length })}</h3>
            {f.evidence_refs.length > 0 ? (
              <ul className="attach-list" data-testid="evidence-refs">
                {f.evidence_refs.map((ref) => (
                  <li key={ref} className="attach">
                    <span className="attach__icon" aria-hidden="true">
                      <FileText size={22} strokeWidth={1.75} />
                    </span>
                    <span className="attach__body">
                      <span className="attach__title">{ref}</span>
                      <span className="attach__meta">{t("decide.evidenceMeta")}</span>
                    </span>
                    <Link className="attach__open" href={ROUTES.validatorFindingCase(f.finding_id)}>
                      {t("decide.open")}
                      <span className="sr-only"> {ref}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t("decide.evidenceNone")}</p>
            )}
            {hypotheses.length > 0 ? (
              <>
                <h3 className="sub-heading">{t("decide.hypotheses")}</h3>
                <ol className="basis-list" data-testid="hypotheses">
                  {hypotheses.map((s, index) => (
                    <TrailItem key={s.id} step={s} t={t} lang={lang} hypothesis={index > 0 ? "systemic" : "cause"} />
                  ))}
                </ol>
              </>
            ) : null}
          </section>

          <section className="card decide-card" aria-labelledby="trail-heading">
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
          {typeof error === "string" ? (
            <p className="callout callout--error" role="alert" data-testid="decision-error">
              {error}
            </p>
          ) : null}
          {closed ? (
            <>
              <p className="callout" data-testid="decision-closed">
                {f.my_decision
                  ? t("decide.already", { decision: t(`decision.${f.my_decision}`) })
                  : t("decide.closed", { outcome: f.outcome ? t(`outcome.${f.outcome}`) : outcome })}
              </p>
              <Quorum approvals={approvals} t={t} outcome={outcome} />
            </>
          ) : (
            <form action={submitDecision} className="form decide-form" data-testid="decision-form">
              <input type="hidden" name="finding_id" value={f.finding_id} />
              {askedEvidence ? (
                <div className="callout callout--inline" role="status" data-testid="decision-evidence">
                  <p className="callout__title">
                    <Info aria-hidden size={20} strokeWidth={2} />
                    {t("decide.askedEvidence")}
                  </p>
                  <p>{t("decide.askedEvidenceBody")}</p>
                </div>
              ) : null}
              <fieldset className="decision-options">
                <legend className="sr-only">{t("decide.choice")}</legend>
                {choices.map((choice, index) => (
                  <DecisionOption key={choice} choice={choice} t={t} first={index === 0} />
                ))}
              </fieldset>
              <DecisionNote label={t("decide.note")} requiredHint={t("decide.noteRequired")} />
              <label>
                {t("decide.confidence")}
                <select name="confidence" defaultValue="">
                  <option value="">{t("decide.confidence.none")}</option>
                  <option value="high">{t("decide.confidence.high")}</option>
                  <option value="medium">{t("decide.confidence.medium")}</option>
                  <option value="low">{t("decide.confidence.low")}</option>
                </select>
              </label>
              <label className="decide-check">
                <input type="checkbox" name="no_conflict" required aria-describedby="conflict-hint" />
                {t("decide.noConflict")}
              </label>
              <p className="sr-only" id="conflict-hint">
                {t("decide.error.conflict")}
              </p>
              <Quorum approvals={approvals} t={t} outcome={outcome} />
              <ConfirmSubmit
                className="button decide-submit"
                title={t("decide.confirm.title")}
                body={t("decide.confirm.body", { id: f.finding_id })}
                confirmLabel={t("decide.confirm.yes")}
                cancelLabel={t("decide.confirm.cancel")}
                pendingLabel={t("decide.submitting")}
                choiceName="decision"
                variants={{
                  needs_evidence: {
                    title: t("decide.confirmOther.title"),
                    body: t("decide.confirmOther.body"),
                    confirmLabel: t("decide.confirmOther.yes"),
                    cancelLabel: t("decide.confirmOther.cancel"),
                  },
                }}
              >
                {t("decide.submit")}
              </ConfirmSubmit>
              <p className="footnote">{t("decide.footnote")}</p>
            </form>
          )}
        </section>
      </div>
    </ValidatorConsole>
  );
}

const DECISION_ICON = { approve: CircleCheck, reject: CircleX, needs_evidence: CircleHelp } as const;
const DECISION_KEY = {
  approve: { label: "decide.approve", hint: "decide.approveHint" },
  reject: { label: "decide.reject", hint: "decide.rejectHint" },
  needs_evidence: { label: "decide.needsEvidence", hint: "decide.needsEvidenceHint" },
} as const;

/** One "Pilihan keputusan" card: icon, label, one-line explanation, radio on the right (TXT-VAL-020). */
function DecisionOption({ choice, t, first }: { choice: DecisionValue; t: Translate; first: boolean }) {
  const Icon = DECISION_ICON[choice];
  const keys = DECISION_KEY[choice];
  return (
    <label className="decision-option">
      <Icon aria-hidden size={24} strokeWidth={2} className={`decision-option__icon--${choice.replace("_", "-")}`} />
      <span className="decision-option__text">
        {t(keys.label)}
        <span className="decision-option__hint">{t(keys.hint)}</span>
      </span>
      <input type="radio" name="decision" value={choice} data-choice={t(keys.label)} required={first} />
    </label>
  );
}

/** "Tenggat putusan: besok, 17 Okt 2026" (accent tone, as in the mockup); "Diterima …" when there is no deadline. */
function DueLine({ deadline, received, t, lang }: { deadline: string | null; received: string; t: Translate; lang: Lang }) {
  const view = deadlineView(deadline);
  if (view.kind === "none") {
    return <span className="decide-head__received">{t("decide.receivedLine", { at: formatDateTime(lang, received) })}</span>;
  }
  const date = formatDate(lang, deadline);
  const text =
    view.kind === "overdue"
      ? t("decide.dueOverdue", { date })
      : t("decide.dueLine", {
          when: view.kind === "days" ? t("decide.due.days", { n: view.days }) : t(`decide.due.${view.kind}`),
          date,
        });
  return (
    <span className={`decide-head__due${view.kind === "overdue" ? " decide-head__due--overdue" : ""}`} data-testid="decision-deadline">
      <time dateTime={deadline ?? undefined}>{text}</time>
    </span>
  );
}

/** "Kuorum 1 dari 2 validator": one mark per approval needed; the outcome word is for screen readers and e2e. */
function Quorum({ approvals, outcome, t }: { approvals: number; outcome: string; t: Translate }) {
  return (
    <p className="quorum-dots" data-testid="quorum-status">
      <span className="quorum-dots__marks" aria-hidden="true">
        {Array.from({ length: QUORUM_SIZE }, (_, i) => (
          <span key={i} className={`quorum-dot${i < approvals ? " quorum-dot--on" : ""}`}>
            {i < approvals ? <Check size={18} strokeWidth={2.5} /> : null}
          </span>
        ))}
      </span>
      {t("decide.quorumOf", { a: approvals, n: QUORUM_SIZE })}
      <span className="sr-only"> · {t("decide.quorumState", { outcome })}</span>
    </p>
  );
}

function TrailItem({
  step,
  t,
  lang,
  hypothesis,
}: {
  step: AuditStep;
  t: Translate;
  lang: "id" | "en";
  hypothesis?: "cause" | "systemic";
}) {
  const view = auditStepView(step.content, lang);
  if (hypothesis) {
    return (
      <li className={`basis-item basis-item--hypothesis${hypothesis === "systemic" ? " basis-item--systemic" : ""}`}>
        <div className="basis-item__head">
          <span>{hypothesis === "systemic" ? t("decide.causeSystemic") : t("decide.cause")}</span>
          {step.status_label ? <EvidenceBadge status={step.status_label} lang={lang} /> : null}
        </div>
        {view.title ? <p className="basis-item__title">{view.title}</p> : null}
        {view.facts.length > 0 ? (
          <p className="basis-item__desc">{view.facts.map((fact) => `${fact.key.replace(/_/g, " ")}: ${fact.value}`).join(" · ")}</p>
        ) : null}
        <details>
          <summary>
            <FileText aria-hidden size={16} strokeWidth={2} />
            {t("decide.seeBasis")}
          </summary>
          {step.evidence_refs.length > 0 ? <p className="cell-finding__meta">{step.evidence_refs.join(", ")}</p> : null}
          <pre className="mono">{JSON.stringify(step.content, null, 2)}</pre>
        </details>
      </li>
    );
  }
  return (
    <li className="basis-item">
      <div className="basis-item__head">
        <span>
          {step.step}
          {step.branch ? ` · ${t("decide.branch", { branch: step.branch })}` : ""} · {step.actor} ·{" "}
          <time dateTime={step.created_at}>{formatDateTime(lang, step.created_at)}</time>
        </span>
        <span className="finding-head">
          {isMachineActor(step.actor) ? (
            <span className="ai-label">
              <Cpu aria-hidden size={14} strokeWidth={2} />
              {t("common.ai.result")}
            </span>
          ) : null}
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
