import { Building2, Check, CircleCheck, FileText, ScrollText, ShieldCheck, TriangleAlert, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EvidenceBadge } from "@/components/EvidenceBadge";
import { ValidationBadge } from "@/components/public/FindingCard";
import { ActorChip } from "@/components/public/LogBits";
import { actionLabel, optional } from "@/components/public/text";
import { ValidatedBy, validatorLabel } from "@/components/ValidatedBy";
import { loadConfig } from "@/lib/config";
import { categoryLabel, loadDomainPacks } from "@/lib/domainpacks";
import { formatNumber, formatDateTime, type Lang, type Translate } from "@/lib/i18n/core";
import { getT } from "@/lib/i18n/server";
import { actorCategory, entryDecision, middleHash } from "@/lib/publicview";
import { getDocument, listCollection, type PublicCase, type PublicFinding, safeLink } from "@/lib/readmodel";
import { getLogForSubject, verifyLog } from "@/lib/transparency";
import { Localized } from "@/components/Localized";

// SCR-043 case page: findings, who validated them (role + regency, never names), the institution's follow-up and
// right of reply, and the decision log of the case with a chain check.
export const dynamic = "force-dynamic";

type Params = Promise<{ caseId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("public.case.title", { id: decodeURIComponent((await params).caseId) }) };
}

function Validators({ t, lang, findings }: { t: Translate; lang: Lang; findings: PublicFinding[] }) {
  const validated = findings.filter((f) => f.validation);
  if (validated.length === 0) {
    return (
      <>
        <p className="pub-quorum">
          <span className="pub-quorum__dot pub-quorum__dot--open" aria-hidden="true" />
          {t("public.validators.pending")}
        </p>
        <p className="muted small">{t("public.validators.none")}</p>
      </>
    );
  }
  return (
    <ul className="pub-validator-groups">
      {validated.map((f) => {
        const v = f.validation!;
        const approvals = v.decisions.filter((d) => d.decision === "approve").length;
        return (
          <li key={f.finding_id}>
            {validated.length > 1 ? <p className="small pub-validator-groups__finding">
                <Localized lang={lang} plain={f.statement} i18n={f.statement_i18n} />
              </p> : null}
            <p className="pub-quorum">
              {v.decisions.map((d, i) => (
                <span
                  key={i}
                  className={`pub-quorum__dot ${d.decision === "approve" ? "pub-quorum__dot--yes" : "pub-quorum__dot--no"}`}
                  aria-hidden="true"
                >
                  {d.decision === "approve" ? <Check size={14} strokeWidth={3} /> : <X size={14} strokeWidth={3} />}
                </span>
              ))}
              {v.outcome === "approved"
                ? t("public.validators.quorumMet", { n: approvals })
                : t("public.validators.returned", { n: v.decisions.length })}
              <time className="muted small" dateTime={v.completed_at}>
                {formatDateTime(lang, v.completed_at)}
              </time>
            </p>
            <ul className="pub-validators">
              {v.decisions.map((d, i) => (
                <li key={i} className="pub-validator">
                  <span className="pub-validator__icon" aria-hidden="true">
                    <ShieldCheck size={18} strokeWidth={2} />
                  </span>
                  <span className="pub-validator__who">{validatorLabel(d, lang)}</span>
                  <span className={`badge ${d.decision === "approve" ? "badge--ok" : "badge--error"}`}>
                    {optional(t, `public.validators.decision.${d.decision}`, d.decision)}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

export default async function CasePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { lang, t } = await getT();
  const config = loadConfig();
  const caseId = decodeURIComponent((await params).caseId);
  const verifyRequested = (await searchParams).verify === "1";

  const [caseDoc, findings] = await Promise.all([
    getDocument<PublicCase>(config, `public_cases/${encodeURIComponent(caseId)}`),
    listCollection<PublicFinding>(config, "public_findings"),
  ]);
  const caseFindings = findings.ok ? findings.data.filter((f) => f.case_id === caseId) : [];
  if (caseDoc.ok && caseDoc.data === null && caseFindings.length === 0) notFound();

  const c = caseDoc.ok ? caseDoc.data : null;
  const [logs, verification, packs] = await Promise.all([
    Promise.all([
      getLogForSubject(config, "case", caseId),
      ...caseFindings.map((f) => getLogForSubject(config, "finding", f.finding_id)),
    ]),
    verifyRequested ? verifyLog(config) : Promise.resolve(null),
    loadDomainPacks(config, c?.domain ? [c.domain] : []),
  ]);
  const entries = logs
    .flatMap((r) => (r.ok ? r.data : []))
    .sort((a, b) => a.seq - b.seq)
    .filter((e, i, all) => i === 0 || all[i - 1].seq !== e.seq);
  const logError = logs.some((r) => !r.ok);
  const category = c?.category ? categoryLabel(packs, c.category, lang) : null;
  const place = [c?.region?.district_name ?? t("public.findings.unknownDistrict"), c?.region?.regency_name]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="pub-case">
      <nav aria-label={t("public.report.breadcrumb")} className="pub-crumbs">
        <ol>
          <li>
            <Link href="/dashboard">{t("public.nav.findings")}</Link>
          </li>
          <li aria-current="page">{caseId}</li>
        </ol>
      </nav>

      <div className="page-header">
        <div>
          <p className="pub-case__kicker">
            {c ? <EvidenceBadge status={c.max_finding_status} lang={lang} /> : null}
            {category ? <span className="muted">{category}</span> : null}
          </p>
          <h1>{t("public.case.title", { id: caseId })}</h1>
          <p className="muted">
            {place}
            {c?.synthetic ? ` · ${t("public.case.synthetic")}` : ""}
          </p>
        </div>
        {c?.status ? (
          <span className="pub-chip">
            {t("public.case.status", { status: optional(t, `public.caseStatus.${c.status}`, c.status) })}
          </span>
        ) : null}
      </div>

      {c ? (
        <dl className="pub-case__fields" data-testid="case-fields">
          <div>
            <dt>{t("public.case.maxEvidence")}</dt>
            <dd>
              <EvidenceBadge status={c.max_finding_status} lang={lang} />
            </dd>
          </div>
          <div>
            <dt>{t("public.case.reportsSignals")}</dt>
            <dd>
              {formatNumber(lang, c.report_count)} / {formatNumber(lang, c.signal_count)}
            </dd>
          </div>
          <div>
            <dt>{t("public.case.lastUpdate")}</dt>
            <dd>{formatDateTime(lang, c.updated_at)}</dd>
          </div>
        </dl>
      ) : null}

      {c?.audit_report ? (
        <p>
          <Link className="button" href={`/cases/${encodeURIComponent(caseId)}/report`} data-testid="open-audit-report">
            <FileText aria-hidden size={16} strokeWidth={2} />
            {t("public.case.openReport")}
          </Link>
        </p>
      ) : null}

      <section aria-labelledby="case-findings" className="pub-block">
        <h2 id="case-findings">{t("public.case.findings")}</h2>
        {caseFindings.length === 0 ? (
          <p className="pub-empty">{t("public.case.findingsEmpty")}</p>
        ) : (
          <ul className="finding-list">
            {caseFindings.map((f) => (
              <li key={f.finding_id} className="card pub-finding" data-testid="finding">
                <div className="finding-head">
                  <EvidenceBadge status={f.status} lang={lang} />
                  <ValidationBadge t={t} validation={f.validation} />
                </div>
                <h3 className="finding-statement">
                  <Localized lang={lang} plain={f.statement} i18n={f.statement_i18n} />
                </h3>
                <ValidatedBy validation={f.validation} lang={lang} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="case-who" className="pub-block">
        <h2 id="case-who">{t("public.case.whoChecked")}</h2>
        <p className="lead">{t("public.case.namesHidden")}</p>
        <div className="pub-two">
          <section className="card" aria-labelledby="case-validators">
            <h3 id="case-validators">{t("public.validators.title")}</h3>
            <Validators t={t} lang={lang} findings={caseFindings} />
            <p className="muted small">{t("public.validators.rule")}</p>
          </section>

          <section className="card" aria-labelledby="case-follow-up">
            <h3 id="case-follow-up">{t("public.followUp.title")}</h3>
            {c?.follow_ups?.length ? (
              <ol className="pub-timeline">
                {c.follow_ups.map((f) => (
                  <li key={f.organization_id} data-testid="follow-up" data-status={f.status}>
                    <p className="pub-timeline__meta">
                      <span className="pub-chip pub-chip--org">
                        <Building2 aria-hidden size={14} strokeWidth={2} />
                        <code>{f.organization_id}</code>
                      </span>
                      <span className="muted small">
                        {t("public.followUp.updated", { time: formatDateTime(lang, f.updated_at) })}
                      </span>
                    </p>
                    <p className="pub-timeline__title">
                      <span
                        className={`badge ${f.status === "done" ? "badge--ok" : f.status === "in_progress" ? "badge--warn" : "badge--neutral"}`}
                      >
                        {optional(t, `public.followUp.${f.status}`, f.status)}
                      </span>
                    </p>
                    {f.note ? <p className="pub-timeline__note">{f.note}</p> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="pub-empty" data-testid="follow-up-empty">
                {t("public.followUp.empty")}
              </p>
            )}

            {c?.replies?.length ? (
              <section aria-labelledby="case-replies" className="pub-replies">
                <h4 id="case-replies">{t("public.reply.title")}</h4>
                <ul className="finding-list">
                  {c.replies.map((r) => {
                    const attachments = (r.attachments ?? [])
                      .map((a) => ({ name: a.name, href: safeLink(a.url) }))
                      .filter((a): a is { name: string; href: string } => a.href !== null);
                    return (
                      <li key={r.reply_id} className="right-of-reply pub-reply" data-testid="right-of-reply">
                        <p className="right-of-reply__label">{t("public.reply.label")}</p>
                        <p className="muted small">
                          <code>{r.organization_id}</code> ·{" "}
                          {t("public.reply.received", { time: formatDateTime(lang, r.received_at) })}
                        </p>
                        <p className="right-of-reply__body">{r.body}</p>
                        {attachments.length ? (
                          <ul>
                            {attachments.map((a, i) => (
                              <li key={`${i}-${a.href}`}>
                                <a href={a.href} rel="noopener noreferrer nofollow" target="_blank">
                                  {a.name || a.href}
                                </a>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : c?.follow_ups?.length ? (
              <div className="callout callout--warning pub-callout-icon">
                <TriangleAlert aria-hidden size={18} strokeWidth={2} />
                <div>
                  <h4>{t("public.reply.none.title")}</h4>
                  <p>{t("public.reply.none.body")}</p>
                </div>
              </div>
            ) : null}

            <p>
              <a className="button button--secondary pub-button-block" href="#case-log">
                <ScrollText aria-hidden size={16} strokeWidth={2} />
                {t("public.case.toLog")}
              </a>
            </p>
          </section>
        </div>
      </section>

      <section aria-labelledby="case-log" className="pub-block">
        <div className="page-header">
          <div>
            <h2 id="case-log">{t("public.caseLog.title")}</h2>
            <p className="muted">{t("public.caseLog.body")}</p>
          </div>
          <form method="get" action={`/cases/${encodeURIComponent(caseId)}`}>
            <input type="hidden" name="verify" value="1" />
            <button type="submit" className="button" data-testid="verify-chain">
              <ShieldCheck aria-hidden size={16} strokeWidth={2} />
              {t("public.chain.verify")}
            </button>
          </form>
        </div>
        {verification ? (
          verification.ok ? (
            verification.data.ok ? (
              <p className="callout callout--success pub-callout-icon" data-testid="verify-result">
                <CircleCheck aria-hidden size={18} strokeWidth={2} />
                <span>
                  <strong>{t("public.chain.verified")}</strong>{" "}
                  {t("public.chain.verifiedBody", {
                    n: formatNumber(lang, verification.data.length),
                    hash: middleHash(verification.data.head_hash),
                  })}
                </span>
              </p>
            ) : (
              <p className="callout callout--error pub-callout-icon" data-testid="verify-result">
                <TriangleAlert aria-hidden size={18} strokeWidth={2} />
                <span>
                  <strong>{t("public.chain.broken")}</strong>{" "}
                  {t("public.chain.brokenAt", {
                    seq: verification.data.first_invalid_seq ?? "?",
                    reason: verification.data.reason ?? "",
                  })}
                </span>
              </p>
            )
          ) : (
            <p className="callout callout--error" data-testid="verify-result">
              {t("public.chain.unavailableShort", { error: verification.error })}
            </p>
          )
        ) : null}
        {logError ? <p className="callout callout--error">{t("public.caseLog.partial")}</p> : null}
        {entries.length === 0 ? (
          <p className="pub-empty">{t("public.caseLog.empty")}</p>
        ) : (
          <div className="table-wrap" role="region" aria-label={t("public.caseLog.tableLabel")} tabIndex={0}>
            <table data-testid="case-log" className="pub-log-table">
              <thead>
                <tr>
                  <th scope="col" className="num">
                    {t("public.caseLog.col.seq")}
                  </th>
                  <th scope="col">{t("public.caseLog.col.recorded")}</th>
                  <th scope="col">{t("public.caseLog.col.actor")}</th>
                  <th scope="col">{t("public.caseLog.col.action")}</th>
                  <th scope="col">{t("public.caseLog.col.reason")}</th>
                  <th scope="col">{t("public.caseLog.col.hash")}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const d = entryDecision(e);
                  return (
                    <tr key={e.seq}>
                      <td className="num">
                        <Link href={`/log/${e.seq}`}>#{e.seq}</Link>
                      </td>
                      <td>
                        <time dateTime={e.recorded_at}>{formatDateTime(lang, e.recorded_at)}</time>
                      </td>
                      <td>
                        <ActorChip t={t} category={actorCategory(e)} />
                        {d.actor?.name ? <span className="muted small pub-log-table__name">{d.actor.name}</span> : null}
                      </td>
                      <td>
                        {actionLabel(t, e.action)}
                        <code className="muted pub-log-table__code">{e.action}</code>
                      </td>
                      <td>{d.reason ?? ""}</td>
                      <td>
                        <code title={e.hash}>{middleHash(e.hash)}</code>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
