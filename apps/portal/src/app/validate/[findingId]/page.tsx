import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EvidenceBadge } from "@/components/EvidenceBadge";
import { ValidatorHeader } from "@/components/ValidatorHeader";
import { loadConfig } from "@/lib/config";
import { formatTime } from "@/lib/format";
import { sessionToken } from "@/lib/session";
import { decide, getAuditTrail, getMyProfile, getValidationRequest } from "@/lib/trust";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Validate finding" };

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
  });
  if (!result.ok) {
    const detail = (result.body as { detail?: unknown } | null)?.detail;
    redirect(
      `/validate/${encodeURIComponent(findingId)}?error=${encodeURIComponent(typeof detail === "string" ? detail : result.error)}`,
    );
  }
  redirect(`/validate?done=${encodeURIComponent(findingId)}`);
}

export default async function ValidateFindingPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const findingId = decodeURIComponent((await params).findingId);
  const token = await sessionToken();
  if (!token) redirect(`/login?next=/validate/${encodeURIComponent(findingId)}`);
  const config = loadConfig();
  const [profile, detail] = await Promise.all([getMyProfile(config, token), getValidationRequest(config, token, findingId)]);
  if (!detail.ok && detail.status === 404) notFound();
  if (!detail.ok) {
    return <p className="callout callout--error">The validation service did not answer ({detail.error}).</p>;
  }
  const f = detail.data;
  const trail = await getAuditTrail(config, token, f.case_id);
  const error = (await searchParams).error;
  const closed = f.outcome !== null || f.my_decision !== null;

  return (
    <>
      <p>
        <Link href="/validate">← Findings waiting for validation</Link>
      </p>
      <h1>Validate finding {f.finding_id}</h1>
      {profile.ok ? <ValidatorHeader profile={profile.data} /> : null}

      <section className="card" aria-labelledby="finding-heading">
        <h2 id="finding-heading">Finding</h2>
        <div className="finding-head">
          <EvidenceBadge status={f.status_label} />
          <span className="badge badge--neutral" data-testid="quorum-status">
            Quorum: {f.quorum.outcome} · {f.quorum.approvals} approval(s), {f.quorum.rejections} rejection(s)
          </span>
        </div>
        <p className="finding-statement" data-testid="finding-statement">
          {f.statement}
        </p>
        <p className="muted">
          Case {f.case_id} · evidence {f.evidence_refs.join(", ") || "—"} · roles asked: {f.required_roles.join(", ") || "any"}
        </p>
        <p className="muted">{f.quorum.reason}</p>
      </section>

      <section aria-labelledby="trail-heading">
        <h2 id="trail-heading">Audit trail</h2>
        {!trail.ok ? (
          <p className="callout callout--error">The audit trail could not be loaded ({trail.error}).</p>
        ) : trail.data.length === 0 ? (
          <p className="muted" data-testid="trail-empty">
            No audit steps recorded for this case yet.
          </p>
        ) : (
          <ol className="audit-trail" data-testid="audit-trail">
            {trail.data.map((s) => (
              <li key={s.id} className="card">
                <div className="finding-head">
                  <span className="badge badge--neutral">{s.step}</span>
                  {s.status_label ? <EvidenceBadge status={s.status_label} /> : null}
                  <span className="muted">
                    {s.actor} · {formatTime(s.created_at)}
                  </span>
                </div>
                <pre className="mono">{JSON.stringify(s.content, null, 2)}</pre>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="decide-heading">
        <h2 id="decide-heading">Your decision</h2>
        {typeof error === "string" ? (
          <p className="callout callout--error" role="alert" data-testid="decision-error">
            {error}
          </p>
        ) : null}
        {closed ? (
          <p className="callout" data-testid="decision-closed">
            {f.my_decision ? `You already decided: ${f.my_decision}.` : `Validation closed: ${f.outcome}.`}
          </p>
        ) : (
          <form action={submitDecision} className="card form" data-testid="decision-form">
            <input type="hidden" name="finding_id" value={f.finding_id} />
            <fieldset>
              <legend>Decision</legend>
              <label>
                <input type="radio" name="decision" value="approve" required /> Approve: the evidence supports this finding
              </label>
              <label>
                <input type="radio" name="decision" value="reject" /> Reject: return it to the audit as an allegation
              </label>
            </fieldset>
            <label>
              Note (public in the decision log; no personal names)
              <textarea name="note" rows={3} maxLength={4000} />
            </label>
            <label>
              <input type="checkbox" name="conflict" /> I have a conflict of interest (recorded, not counted)
            </label>
            <button type="submit" className="button">
              Submit decision
            </button>
          </form>
        )}
      </section>
    </>
  );
}
