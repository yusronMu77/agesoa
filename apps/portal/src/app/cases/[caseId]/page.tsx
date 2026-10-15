import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/Badge";
import { EvidenceBadge } from "@/components/EvidenceBadge";
import { ValidatedBy } from "@/components/ValidatedBy";
import { loadConfig } from "@/lib/config";
import { formatTime, shortHash } from "@/lib/format";
import {
  FOLLOW_UP_STATUS_LABEL,
  getDocument,
  listCollection,
  type PublicCase,
  type PublicFinding,
  safeLink,
} from "@/lib/readmodel";
import { getLogForSubject, type LogEntry, verifyLog } from "@/lib/transparency";

export const dynamic = "force-dynamic";

type Params = Promise<{ caseId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return { title: `Case ${decodeURIComponent((await params).caseId)}` };
}

function decisionOf(entry: LogEntry): { actor?: { kind?: string; name?: string }; reason?: string; status_label?: string } {
  const value = entry.entry as { decision?: Record<string, unknown> } | null;
  return (value?.decision ?? {}) as ReturnType<typeof decisionOf>;
}

export default async function CasePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const config = loadConfig();
  const caseId = decodeURIComponent((await params).caseId);
  const verifyRequested = (await searchParams).verify === "1";

  const [caseDoc, findings] = await Promise.all([
    getDocument<PublicCase>(config, `public_cases/${encodeURIComponent(caseId)}`),
    listCollection<PublicFinding>(config, "public_findings"),
  ]);
  const caseFindings = findings.ok ? findings.data.filter((f) => f.case_id === caseId) : [];
  if (caseDoc.ok && caseDoc.data === null && caseFindings.length === 0) notFound();

  const logs = await Promise.all([
    getLogForSubject(config, "case", caseId),
    ...caseFindings.map((f) => getLogForSubject(config, "finding", f.finding_id)),
  ]);
  const entries = logs
    .flatMap((r) => (r.ok ? r.data : []))
    .sort((a, b) => a.seq - b.seq)
    .filter((e, i, all) => i === 0 || all[i - 1].seq !== e.seq);
  const logError = logs.some((r) => !r.ok);
  const verification = verifyRequested ? await verifyLog(config) : null;
  const c = caseDoc.ok ? caseDoc.data : null;

  return (
    <>
      <p>
        <Link href="/dashboard">← Public dashboard</Link>
      </p>
      <div className="page-header">
        <div>
          <h1>Case {caseId}</h1>
          <p className="muted">
            {c?.region?.district_name ?? "Unknown district"}
            {c?.region?.regency_name ? `, ${c.region.regency_name}` : ""}
            {c?.category ? ` · ${c.category}` : ""}
            {c?.synthetic ? " · synthetic (demo) case" : ""}
          </p>
        </div>
        {c?.status ? <Badge tone="neutral">Status: {c.status}</Badge> : null}
      </div>

      {c ? (
        <dl className="fields" data-testid="case-fields">
          <div>
            <dt>Highest evidence status</dt>
            <dd>
              <EvidenceBadge status={c.max_finding_status} />
            </dd>
          </div>
          <div>
            <dt>Reports / public signals</dt>
            <dd>
              {c.report_count} / {c.signal_count}
            </dd>
          </div>
          <div>
            <dt>Last update</dt>
            <dd>{formatTime(c.updated_at)}</dd>
          </div>
        </dl>
      ) : null}

      <section aria-labelledby="case-findings">
        <h2 id="case-findings">Findings</h2>
        {caseFindings.length === 0 ? (
          <p className="muted">No findings for this case yet.</p>
        ) : (
          <ul className="finding-list">
            {caseFindings.map((f) => (
              <li key={f.finding_id} className="card" data-testid="finding">
                <div className="finding-head">
                  <EvidenceBadge status={f.status} />
                  <span className="badge badge--neutral">
                    {f.validation
                      ? f.validation.outcome === "approved"
                        ? `Validated by ${f.validation.decisions.length} people`
                        : "Returned to the audit"
                      : "Waiting for validation"}
                  </span>
                </div>
                <p className="finding-statement">{f.statement}</p>
                <ValidatedBy validation={f.validation} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="case-follow-up">
        <h2 id="case-follow-up">Institution follow-up</h2>
        {c?.follow_ups?.length ? (
          <ul className="finding-list">
            {c.follow_ups.map((f) => (
              <li key={f.organization_id} className="card" data-testid="follow-up" data-status={f.status}>
                <div className="finding-head">
                  <Badge tone={f.status === "done" ? "ok" : f.status === "in_progress" ? "warn" : "neutral"}>
                    {FOLLOW_UP_STATUS_LABEL[f.status] ?? f.status}
                  </Badge>
                  <span className="muted">
                    <code>{f.organization_id}</code> · updated <time dateTime={f.updated_at}>{formatTime(f.updated_at)}</time>
                  </span>
                </div>
                {f.note ? <p className="finding-statement">{f.note}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted" data-testid="follow-up-empty">
            No follow-up yet.
          </p>
        )}
      </section>

      {c?.replies?.length ? (
        <section aria-labelledby="case-replies">
          <h2 id="case-replies">Right of reply</h2>
          <ul className="finding-list">
            {c.replies.map((r) => {
              const attachments = (r.attachments ?? [])
                .map((a) => ({ name: a.name, href: safeLink(a.url) }))
                .filter((a): a is { name: string; href: string } => a.href !== null);
              return (
                <li key={r.reply_id} className="card right-of-reply" data-testid="right-of-reply">
                  <p className="right-of-reply__label">
                    Right of reply from the institution — the institution&apos;s own statement, not verified by AGESOA
                  </p>
                  <p className="muted">
                    <code>{r.organization_id}</code> · received{" "}
                    <time dateTime={r.received_at}>{formatTime(r.received_at)}</time>
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
      ) : null}

      <section aria-labelledby="case-log">
        <div className="page-header">
          <div>
            <h2 id="case-log">Decision log for this case</h2>
            <p className="muted">
              Every step with its actor (agent, rule or human role), reason and evidence references. The whole chain can
              be recomputed by anyone.
            </p>
          </div>
          <form method="get" action={`/cases/${encodeURIComponent(caseId)}`}>
            <input type="hidden" name="verify" value="1" />
            <button type="submit" className="button" data-testid="verify-chain">
              Verify chain
            </button>
          </form>
        </div>
        {verification ? (
          verification.ok ? (
            verification.data.ok ? (
              <p className="callout" data-testid="verify-result">
                <Badge tone="ok">Chain verified</Badge> All {verification.data.length} entries recomputed; head{" "}
                <code>{shortHash(verification.data.head_hash)}</code>.
              </p>
            ) : (
              <p className="callout callout--error" data-testid="verify-result">
                <Badge tone="error">Chain broken</Badge> at entry #{verification.data.first_invalid_seq}:{" "}
                {verification.data.reason}
              </p>
            )
          ) : (
            <p className="callout callout--error" data-testid="verify-result">
              Verification unavailable ({verification.error}).
            </p>
          )
        ) : null}
        {logError ? <p className="callout callout--error">Part of the log could not be loaded.</p> : null}
        {entries.length === 0 ? (
          <p className="muted">No decisions recorded for this case yet.</p>
        ) : (
          <div className="table-wrap" role="region" aria-label="Decision log for this case" tabIndex={0}>
            <table data-testid="case-log">
              <thead>
                <tr>
                  <th scope="col" className="num">
                    Seq
                  </th>
                  <th scope="col">Recorded</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Action</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Hash</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const d = decisionOf(e);
                  return (
                    <tr key={e.seq}>
                      <td className="num">
                        <Link href={`/log/${e.seq}`}>#{e.seq}</Link>
                      </td>
                      <td>
                        <time dateTime={e.recorded_at}>{formatTime(e.recorded_at)}</time>
                      </td>
                      <td>
                        {d.actor?.name ?? "—"} <span className="muted">({d.actor?.kind ?? "?"})</span>
                      </td>
                      <td>
                        <code>{e.action}</code>
                      </td>
                      <td>{d.reason ?? ""}</td>
                      <td>
                        <code title={e.hash}>{shortHash(e.hash)}</code>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
