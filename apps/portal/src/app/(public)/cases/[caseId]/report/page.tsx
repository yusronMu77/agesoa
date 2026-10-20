import { CircleCheck, Cpu, ScrollText, ShieldCheck, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EvidenceBadge } from "@/components/EvidenceBadge";
import { actionLabel, count } from "@/components/public/text";
import { ValidatedBy } from "@/components/ValidatedBy";
import { loadConfig } from "@/lib/config";
import { categoryLabel, loadDomainPacks } from "@/lib/domainpacks";
import { formatDateTime, type Translate } from "@/lib/i18n/core";
import { getT } from "@/lib/i18n/server";
import { middleHash } from "@/lib/publicview";
import { getDocument, listCollection, type PublicCase, type PublicFinding } from "@/lib/readmodel";
import { getLogForSubject } from "@/lib/transparency";
import { Localized } from "@/components/Localized";
import { localizedList } from "@/lib/localized";

// SCR-041 Audit report of a case: the reported symptom and the root causes as a vertical chain, each with its
// evidence status, and a sticky side column with recommendations, validators and the decision log entries behind it.
// Everything comes from the public read model and the public log.
export const dynamic = "force-dynamic";

type Params = Promise<{ caseId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { t } = await getT();
  return { title: `${t("public.report.crumb")} · ${decodeURIComponent((await params).caseId)}` };
}

function AiMarker({ t }: { t: Translate }) {
  return (
    <span className="ai-label pub-ai">
      <Cpu aria-hidden size={14} strokeWidth={2} />
      {t("common.ai.result")}
    </span>
  );
}

function evidenceText(t: Translate, n: number): string {
  if (n <= 0) return t("public.report.evidence.none");
  return t(n === 1 ? "public.report.evidence.one" : "public.report.evidence.other", { n });
}

export default async function AuditReportPage({ params }: { params: Params }) {
  const { lang, t } = await getT();
  const config = loadConfig();
  const caseId = decodeURIComponent((await params).caseId);
  const [caseDoc, findings, log] = await Promise.all([
    getDocument<PublicCase>(config, `public_cases/${encodeURIComponent(caseId)}`),
    listCollection<PublicFinding>(config, "public_findings"),
    getLogForSubject(config, "case", caseId),
  ]);
  if (!caseDoc.ok) {
    return (
      <p className="callout callout--error" role="alert">
        {t("public.report.unavailable")}
      </p>
    );
  }
  const c = caseDoc.data;
  if (!c) notFound();
  const report = c.audit_report ?? null;
  const caseFindings = findings.ok ? findings.data.filter((f) => f.case_id === caseId) : [];
  const symptoms = caseFindings.filter((f) => f.statement);
  const entries = log.ok ? log.data : [];
  const packs = await loadDomainPacks(config, c.domain ? [c.domain] : []);
  const category = c.category ? categoryLabel(packs, c.category, lang) : c.domain;
  const caseHref = `/cases/${encodeURIComponent(caseId)}`;

  return (
    <div className="pub-report">
      <nav aria-label={t("public.report.breadcrumb")} className="pub-crumbs">
        <ol>
          <li>
            <Link href="/dashboard">{t("public.nav.findings")}</Link>
          </li>
          <li>
            <Link href={caseHref}>{caseId}</Link>
          </li>
          <li aria-current="page">{t("public.report.crumb")}</li>
        </ol>
      </nav>

      {!report ? (
        <section className="card" data-testid="audit-report-missing">
          <h1>{t("public.report.missingTitle")}</h1>
          <p className="muted">{t("public.report.missingBody")}</p>
        </section>
      ) : (
        <article data-testid="audit-report">
          <header className="pub-report__head">
            <p className="pub-case__kicker">
              <EvidenceBadge status={c.max_finding_status} lang={lang} />
              {category ? <span className="muted">{category}</span> : null}
            </p>
            <h1 data-testid="audit-report-summary">
              <Localized lang={lang} plain={report.summary} i18n={report.summary_i18n} />
            </h1>
            <p className="pub-report__meta muted">
              <span>{c.region?.regency_name ?? t("public.report.unknownRegion")}</span>
              <span>{count(t, "reports", c.report_count)}</span>
              <span>{t("public.report.written", { time: formatDateTime(lang, report.created_at) })}</span>
              {c.synthetic ? <span>{t("public.report.synthetic")}</span> : null}
            </p>
          </header>

          <div className="report-layout">
            <section className="card" aria-labelledby="why-heading">
              <h2 id="why-heading">{t("public.report.why")}</h2>
              <p className="muted">{t("public.report.whyBody")}</p>
              <p>
                <AiMarker t={t} />
              </p>

              <ol className="pub-tree">
                {symptoms.length ? (
                  <li className="pub-node pub-node--symptom">
                    <p className="pub-node__kind">{t("public.report.symptom")}</p>
                    <ul className="pub-node__symptoms">
                      {symptoms.map((f) => (
                        <li key={f.finding_id}>
                          <div className="pub-node__row">
                            <p className="cause-statement">
                              <Localized lang={lang} plain={f.statement} i18n={f.statement_i18n} />
                            </p>
                            <EvidenceBadge status={f.status} lang={lang} />
                          </div>
                          <p className="muted small">{count(t, "evidence", f.evidence_count)}</p>
                        </li>
                      ))}
                    </ul>
                    <p className="pub-tree__link" aria-hidden="true">
                      <span>{t("public.report.because")}</span>
                    </p>
                  </li>
                ) : null}
                {report.root_causes.map((cause, i) => (
                  <li
                    key={`${i}-${cause.statement}`}
                    className={`pub-node pub-node--cause pub-node--${cause.status}`}
                    data-testid="root-cause"
                  >
                    <div className="pub-node__row">
                      <p className="pub-node__kind">{t("public.report.cause", { n: i + 1 })}</p>
                      <EvidenceBadge status={cause.status} lang={lang} />
                    </div>
                    <p className="cause-statement">
                      <Localized lang={lang} plain={cause.statement} i18n={cause.statement_i18n} />
                    </p>
                    <p className="muted small" data-testid="root-cause-evidence">
                      {evidenceText(t, cause.evidence_count)}
                    </p>
                  </li>
                ))}
              </ol>
            </section>

            <aside className="report-side">
              <section className="card" aria-labelledby="rec-heading" data-testid="recommendations">
                <h2 id="rec-heading">{t("public.report.recommendations")}</h2>
                <p>
                  <AiMarker t={t} />
                </p>
                {report.recommendations.length === 0 ? (
                  <p className="muted">{t("public.report.recommendationsNone")}</p>
                ) : (
                  <ul className="pub-checklist">
                    {localizedList(lang, report.recommendations, report.recommendations_i18n).map((r, i) => (
                      <li key={`${i}-${r.text}`} data-testid="recommendation" lang={r.lang}>
                        <CircleCheck aria-hidden size={18} strokeWidth={2} />
                        {r.text}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="card" aria-labelledby="val-heading">
                <h2 id="val-heading">{t("public.validators.title")}</h2>
                {caseFindings.some((f) => f.validation) ? (
                  caseFindings
                    .filter((f) => f.validation)
                    .map((f) =>
                      f.validation?.outcome === "approved" ? (
                        <div key={f.finding_id} className="pub-validated">
                          <ShieldCheck aria-hidden size={18} strokeWidth={2} />
                          <ValidatedBy validation={f.validation} lang={lang} />
                        </div>
                      ) : (
                        <p key={f.finding_id} className="muted">
                          {t("public.validators.returned", { n: f.validation?.decisions.length ?? 0 })}
                        </p>
                      ),
                    )
                ) : (
                  <p className="muted">{t("public.validators.none")}</p>
                )}
                <p>
                  <Link href={caseHref} className="pub-more">
                    <Users aria-hidden size={16} strokeWidth={2} />
                    {t("public.report.toCase")}
                  </Link>
                </p>
              </section>

              <section className="card" aria-labelledby="check-heading" data-testid="report-log">
                <h2 id="check-heading">{t("public.report.check")}</h2>
                <p className="muted">{t("public.report.checkBody")}</p>
                {!log.ok ? (
                  <p className="callout callout--error">{t("public.report.logError")}</p>
                ) : entries.length === 0 ? (
                  <p className="muted">{t("public.report.logEmpty")}</p>
                ) : (
                  <ul className="pub-entry-links pub-entry-links--scroll" tabIndex={0} aria-labelledby="check-heading">
                    {entries.map((e) => (
                      <li key={e.seq}>
                        <Link href={`/log/${e.seq}`} data-testid="report-log-entry">
                          <span className="mono">#{e.seq}</span> {actionLabel(t, e.action)}
                        </Link>
                        <code className="muted" title={e.hash}>
                          {middleHash(e.hash)}
                        </code>
                      </li>
                    ))}
                  </ul>
                )}
                <p>
                  <Link className="button button--secondary pub-button-block" href={`${caseHref}?verify=1#case-log`}>
                    <ScrollText aria-hidden size={16} strokeWidth={2} />
                    {t("public.report.verify")}
                  </Link>
                </p>
              </section>
            </aside>
          </div>
        </article>
      )}
    </div>
  );
}
