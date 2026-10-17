import { Badge } from "@agesoa/ui/components/badge";
import { EvidenceBadge } from "@/components/shared/evidence-badge";
import { Callout } from "@/components/ui/callout";
import { formatTime } from "@/lib/format";
import type { AuditStep } from "@/services/case-audit/case-audit.model";
import type { FetchResult } from "@/services/http/fetch-json";
import type { ValidationDetail } from "@/services/trust/trust.model";

/** The finding under review with its quorum status and evidence references. */
export function FindingSummary({ finding: f }: { finding: ValidationDetail }) {
  return (
    <section className="card" aria-labelledby="finding-heading">
      <h2 id="finding-heading">Finding</h2>
      <div className="finding-head">
        <EvidenceBadge status={f.status_label} />
        <Badge variant="neutral" data-testid="quorum-status">
          Quorum: {f.quorum.outcome} · {f.quorum.approvals} approval(s), {f.quorum.rejections} rejection(s)
        </Badge>
      </div>
      <p className="finding-statement" data-testid="finding-statement">
        {f.statement}
      </p>
      <p className="muted">
        Case {f.case_id} · evidence {f.evidence_refs.join(", ") || "—"} · roles asked: {f.required_roles.join(", ") || "any"}
      </p>
      <p className="muted">{f.quorum.reason}</p>
    </section>
  );
}

/** Every step Agen Audit took on the case, as recorded by case-audit. */
export function AuditTrail({ trail }: { trail: FetchResult<AuditStep[]> }) {
  return (
    <section aria-labelledby="trail-heading">
      <h2 id="trail-heading">Audit trail</h2>
      {!trail.ok ? (
        <Callout tone="error">The audit trail could not be loaded ({trail.error}).</Callout>
      ) : trail.data.length === 0 ? (
        <p className="muted" data-testid="trail-empty">
          No audit steps recorded for this case yet.
        </p>
      ) : (
        <ol className="audit-trail" data-testid="audit-trail">
          {trail.data.map((s) => (
            <li key={s.id} className="card">
              <div className="finding-head">
                <Badge variant="neutral">{s.step}</Badge>
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
  );
}
