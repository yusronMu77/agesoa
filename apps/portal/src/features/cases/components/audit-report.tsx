import Link from "next/link";
import { EvidenceBadge } from "@/components/shared/evidence-badge";
import { ValidatedBy } from "@/components/shared/validated-by";
import { buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { ROUTES } from "@/configs/routes.config";
import { shortHash } from "@/lib/format";
import type { FetchResult } from "@/services/http/fetch-json";
import type { PublicFinding, PublicRootCause } from "@/services/read-model/read-model.model";
import type { LogEntry } from "@/services/transparency/transparency.model";
import { evidenceCountText } from "../constants";

/** Marks content drafted by an agent (text label, no sparkle icon). */
function AiLabel() {
  return <span className="ai-label">AI result</span>;
}

export function RootCauses({ causes }: { causes: PublicRootCause[] }) {
  return (
    <section className="card" aria-labelledby="why-heading">
      <h2 id="why-heading">Why it keeps happening</h2>
      <p className="muted">
        Root causes found by the audit, each with the status of its evidence. <AiLabel />
      </p>
      <ol className="cause-chain">
        {causes.map((cause, i) => (
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
  );
}

export function Recommendations({ items }: { items: string[] }) {
  return (
    <section className="card" aria-labelledby="rec-heading" data-testid="recommendations">
      <h2 id="rec-heading">Recommendations</h2>
      <p>
        <AiLabel />
      </p>
      {items.length === 0 ? (
        <p className="muted">No recommendation in this report.</p>
      ) : (
        <ul>
          {items.map((r) => (
            <li key={r} data-testid="recommendation">
              {r}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ReportValidators({ findings }: { findings: PublicFinding[] }) {
  const validated = findings.filter((f) => f.validation);
  return (
    <section className="card" aria-labelledby="val-heading">
      <h2 id="val-heading">Validators</h2>
      {validated.length ? (
        validated.map((f) => <ValidatedBy key={f.finding_id} validation={f.validation} />)
      ) : (
        <p className="muted">No validation recorded for the findings of this case yet.</p>
      )}
    </section>
  );
}

/** "Check it yourself": the log entries of the case and a link that verifies the chain on the case page. */
export function ReportLog({ caseId, log }: { caseId: string; log: FetchResult<LogEntry[]> }) {
  return (
    <section className="card" aria-labelledby="check-heading" data-testid="report-log">
      <h2 id="check-heading">Check it yourself</h2>
      <p className="muted">Every decision on this case is an entry of the hash-chained public log.</p>
      {!log.ok ? (
        <Callout tone="error">The log could not be loaded.</Callout>
      ) : log.data.length === 0 ? (
        <p className="muted">No log entry for this case yet.</p>
      ) : (
        <ul className="plain">
          {log.data.map((e) => (
            <li key={e.seq}>
              <Link href={ROUTES.logEntry(e.seq)} data-testid="report-log-entry">
                #{e.seq} {e.action}
              </Link>{" "}
              <code className="muted">{shortHash(e.hash)}</code>
            </li>
          ))}
        </ul>
      )}
      <p>
        <Link className={buttonClass()} href={`${ROUTES.case(caseId)}?verify=1#case-log`}>
          Verify the chain
        </Link>
      </p>
    </section>
  );
}
