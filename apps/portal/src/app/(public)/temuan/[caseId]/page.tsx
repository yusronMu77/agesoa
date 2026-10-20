import { Building2, CircleCheck, ShieldCheck, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { QuorumLine, QuorumProgress, validationsOf } from "@/components/public/Validators";
import { ActorChip } from "@/components/public/LogBits";
import { actionLabel, optional } from "@/components/public/text";
import { validatorLabel } from "@/components/ValidatedBy";
import { loadConfig } from "@/lib/config";
import { formatDate, formatDateTime, formatNumber } from "@/lib/i18n/core";
import { getT } from "@/lib/i18n/server";
import { ROUTES } from "@/lib/routes";
import { actorCategory, entryDecision, middleHash, quorumFinding } from "@/lib/publicview";
import { getDocument, listCollection, type PublicCase, type PublicFinding, safeLink } from "@/lib/readmodel";
import { getLogForSubject, verifyLog } from "@/lib/transparency";

// SCR-043 case page "Siapa yang memeriksa, dan apa tindak lanjutnya": who validated the case's findings (role +
// regency, never names), the institution's follow-up and right of reply, then the case's decision log with a chain
// check.
export const dynamic = "force-dynamic";

type Params = Promise<{ caseId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("public.case.title", { id: decodeURIComponent((await params).caseId) }) };
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
  if (caseDoc.ok && caseDoc.data === null && caseFindings.length === 0) {
    // `/temuan/<finding id>` (old `/findings/<id>` links): the finding's page is its case page.
    const finding = findings.ok ? findings.data.find((f) => f.finding_id === caseId) : undefined;
    if (finding?.case_id) permanentRedirect(ROUTES.case(finding.case_id));
    notFound();
  }

  const c = caseDoc.ok ? caseDoc.data : null;
  const [logs, verification] = await Promise.all([
    Promise.all([
      getLogForSubject(config, "case", caseId),
      ...caseFindings.map((f) => getLogForSubject(config, "finding", f.finding_id)),
    ]),
    verifyRequested ? verifyLog(config) : Promise.resolve(null),
  ]);
  const entries = logs
    .flatMap((r) => (r.ok ? r.data : []))
    .sort((a, b) => a.seq - b.seq)
    .filter((e, i, all) => i === 0 || all[i - 1].seq !== e.seq);
  const logError = logs.some((r) => !r.ok);
  const validated = validationsOf(caseFindings);
  const quorum = quorumFinding(caseFindings);

  return (
    <div className="pub-case">
      <nav aria-label={t("public.report.breadcrumb")} className="pub-crumbs">
        <ol>
          <li>
            <Link href={ROUTES.home}>{t("public.nav.findings")}</Link>
          </li>
          <li>
            {c?.audit_report ? (
              <Link href={ROUTES.caseReport(caseId)} data-testid="open-audit-report">
                {caseId}
              </Link>
            ) : (
              caseId
            )}
          </li>
          <li aria-current="page">{t("public.case.crumb")}</li>
        </ol>
      </nav>

      <h1 className="sr-only">{t("public.case.title", { id: caseId })}</h1>
      <header className="pub-case__head">
        <h2 className="pub-case__title">{t("public.case.whoChecked")}</h2>
        <p className="pub-case__lead">{t("public.case.namesHidden")}</p>
      </header>

      <div className="pub-two">
        <section className="card pub-case-card" aria-labelledby="case-validators">
          <div className="pub-case-card__head">
            <h3 id="case-validators">{t("public.validators.title")}</h3>
            <QuorumLine t={t} finding={quorum} />
          </div>
          <QuorumProgress t={t} lang={lang} finding={quorum} />
          {validated.length === 0 ? (
            quorum?.validation_progress ? (
              <p className="muted small">{t("public.validators.progressNote")}</p>
            ) : (
              <p className="pub-empty">{t("public.validators.none")}</p>
            )
          ) : (
            <ul className="pub-validators">
              {validated.flatMap((f) =>
                f.validation.decisions.map((d, i) => (
                  <li key={`${f.finding_id}-${i}`} className="pub-validator">
                    <span className="pub-validator__icon" aria-hidden="true">
                      <ShieldCheck size={20} strokeWidth={2} />
                    </span>
                    <span className="pub-validator__who">
                      <span className="pub-validator__name">
                        {t("public.validators.anonymous", { letter: String.fromCharCode(65 + (i % 26)) })}
                      </span>
                      <span className="pub-validator__role">{validatorLabel(d, lang)}</span>
                    </span>
                    <span className="pub-validator__side">
                      <span className={`badge ${d.decision === "approve" ? "badge--ok" : "badge--error"}`}>
                        {optional(t, `public.validators.decision.${d.decision}`, d.decision)}
                      </span>
                      <time dateTime={f.validation.completed_at}>{formatDateTime(lang, f.validation.completed_at)}</time>
                    </span>
                  </li>
                )),
              )}
            </ul>
          )}
          <p className="pub-case-card__note">{t("public.validators.rule")}</p>
        </section>

        <section className="card pub-case-card" aria-labelledby="case-follow-up">
          <div className="pub-case-card__head">
            <h3 id="case-follow-up">{t("public.followUp.title")}</h3>
            {c?.follow_ups?.[0] ? (
              <span className="pub-chip pub-chip--org">
                <Building2 aria-hidden size={14} strokeWidth={2} />
                {c.follow_ups[0].organization_id}
              </span>
            ) : null}
          </div>
          {c?.follow_ups?.length ? (
            <ol className="pub-timeline">
              {c.follow_ups.map((f) => (
                <li key={f.organization_id} data-testid="follow-up" data-status={f.status}>
                  <p className="pub-timeline__meta">
                    <time dateTime={f.updated_at}>{formatDate(lang, f.updated_at)}</time>
                    {c.follow_ups!.length > 1 ? <span> · {f.organization_id}</span> : null}
                  </p>
                  <p className="pub-timeline__title">{optional(t, `public.followUp.${f.status}`, f.status)}</p>
                  {f.note ? <p className="pub-timeline__note">{f.note}</p> : null}
                  {f.detail ? (
                    <blockquote className="pub-timeline__detail" data-testid="follow-up-detail">
                      <p className="pub-timeline__detail-label">{t("public.followUp.detail")}</p>
                      {/* As written by the institution: not edited, not translated. */}
                      <p className="pub-timeline__detail-body">{f.detail}</p>
                      <p className="pub-reply__label">{t("public.followUp.detailLabel")}</p>
                    </blockquote>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="pub-empty" data-testid="follow-up-empty">
              {t("public.followUp.empty")}
            </p>
          )}

          {c?.replies?.length ? (
            c.replies.map((r) => {
              const attachments = (r.attachments ?? [])
                .map((a) => ({ name: a.name, href: safeLink(a.url) }))
                .filter((a): a is { name: string; href: string } => a.href !== null);
              return (
                <div key={r.reply_id} className="callout callout--warning pub-callout-icon" data-testid="right-of-reply">
                  <TriangleAlert aria-hidden size={18} strokeWidth={2} />
                  <div>
                    <h4>{t("public.reply.official")}</h4>
                    <p>
                      {formatDateTime(lang, r.received_at)} · {r.organization_id}
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
                    <p className="pub-reply__label">{t("public.reply.label")}</p>
                  </div>
                </div>
              );
            })
          ) : c?.follow_ups?.length ? (
            <div className="callout callout--warning pub-callout-icon">
              <TriangleAlert aria-hidden size={18} strokeWidth={2} />
              <div>
                <h4>{t("public.reply.none.title")}</h4>
                <p>{t("public.reply.none.body")}</p>
              </div>
            </div>
          ) : null}

          <a className="button button--secondary pub-button-block" href="#case-log">
            {t("public.case.toLog")}
          </a>
        </section>
      </div>

      <section aria-labelledby="case-log" className="pub-block">
        <div className="page-header">
          <div>
            <h2 id="case-log">{t("public.caseLog.title")}</h2>
            <p className="muted">{t("public.caseLog.body")}</p>
          </div>
          <form method="get" action={ROUTES.case(caseId)}>
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
