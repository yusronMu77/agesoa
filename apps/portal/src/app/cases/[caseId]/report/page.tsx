import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EvidenceBadge } from "@/components/EvidenceBadge";
import { ValidatedBy } from "@/components/ValidatedBy";
import { loadConfig } from "@/lib/config";
import { formatTime, shortHash } from "@/lib/format";
import {
  evidenceCountText,
  getDocument,
  listCollection,
  type PublicCase,
  type PublicFinding,
} from "@/lib/readmodel";
import { getLogForSubject } from "@/lib/transparency";

// SCR-041 Audit report of a case: root causes with their evidence status, recommendations, who validated, and the
// decision log entries behind it. Everything comes from the public read model and the public log.
export const dynamic = "force-dynamic";

type Params = Promise<{ caseId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return { title: `Audit report · ${decodeURIComponent((await params).caseId)}` };
}

export default async function AuditReportPage({ params }: { params: Params }) {
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
        The public data is temporarily unavailable. Please try again in a moment.
      </p>
    );
  }
  const c = caseDoc.data;
  if (!c) notFound();
  const report = c.audit_report ?? null;
  const caseFindings = findings.ok ? findings.data.filter((f) => f.case_id === caseId) : [];
  const entries = log.ok ? log.data : [];

  return (
    <>
      <nav aria-label="Breadcrumb">
        <p>
          <Link href="/dashboard">Public dashboard</Link> / <Link href={`/cases/${encodeURIComponent(caseId)}`}>{caseId}</Link> /
          Audit report
        </p>
      </nav>

      {!report ? (
        <section className="card" data-testid="audit-report-missing">
          <h1>Audit report</h1>
          <p className="muted">
            No audit report for this case yet. A report is written after the findings of the case have been validated.
          </p>
        </section>
      ) : (
        <article data-testid="audit-report">
          <div className="page-header">
            <div>
              <p>
                <EvidenceBadge status={c.max_finding_status} /> <span className="muted">{c.category ?? c.domain}</span>
              </p>
              <h1 data-testid="audit-report-summary">{report.summary}</h1>
              <p className="muted">
                {c.region?.regency_name ?? "Unknown region"} · {c.report_count} report{c.report_count === 1 ? "" : "s"} ·
                written {formatTime(report.created_at)}
                {c.synthetic ? " · synthetic (demo) data" : ""}
              </p>
            </div>
          </div>

          <div className="report-layout">
            <section className="card" aria-labelledby="why-heading">
              <h2 id="why-heading">Why it keeps happening</h2>
              <p className="muted">
                Root causes found by the audit, each with the status of its evidence. <span className="ai-label">AI result</span>
              </p>
              <ol className="cause-chain">
                {report.root_causes.map((cause, i) => (
                  <li key={`${i}-${cause.statement}`} className="card cause" data-testid="root-cause">
                    <div className="finding-head">
                      <span className="muted">Root cause {i + 1}</span>
                      <EvidenceBadge status={cause.status} />
                    </div>
                    <p className="cause-statement">{cause.statement}</p>
                    <p className="muted small" data-testid="root-cause-evidence">
                      {evidenceCountText(cause.evidence_count)}
                    </p>
                  </li>
                ))}
              </ol>
            </section>

            <aside className="report-side">
              <section className="card" aria-labelledby="rec-heading" data-testid="recommendations">
                <h2 id="rec-heading">Recommendations</h2>
                <p>
                  <span className="ai-label">AI result</span>
                </p>
                {report.recommendations.length === 0 ? (
                  <p className="muted">No recommendation in this report.</p>
                ) : (
                  <ul>
                    {report.recommendations.map((r) => (
                      <li key={r} data-testid="recommendation">
                        {r}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="card" aria-labelledby="val-heading">
                <h2 id="val-heading">Validators</h2>
                {caseFindings.some((f) => f.validation) ? (
                  caseFindings
                    .filter((f) => f.validation)
                    .map((f) => <ValidatedBy key={f.finding_id} validation={f.validation} />)
                ) : (
                  <p className="muted">No validation recorded for the findings of this case yet.</p>
                )}
              </section>

              <section className="card" aria-labelledby="check-heading" data-testid="report-log">
                <h2 id="check-heading">Check it yourself</h2>
                <p className="muted">Every decision on this case is an entry of the hash-chained public log.</p>
                {!log.ok ? (
                  <p className="callout callout--error">The log could not be loaded.</p>
                ) : entries.length === 0 ? (
                  <p className="muted">No log entry for this case yet.</p>
                ) : (
                  <ul className="plain">
                    {entries.map((e) => (
                      <li key={e.seq}>
                        <Link href={`/log/${e.seq}`} data-testid="report-log-entry">
                          #{e.seq} {e.action}
                        </Link>{" "}
                        <code className="muted">{shortHash(e.hash)}</code>
                      </li>
                    ))}
                  </ul>
                )}
                <p>
                  <Link className="button" href={`/cases/${encodeURIComponent(caseId)}?verify=1#case-log`}>
                    Verify the chain
                  </Link>
                </p>
              </section>
            </aside>
          </div>
        </article>
      )}
    </>
  );
}
