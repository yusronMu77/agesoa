import { Badge } from "@agesoa/ui/components/badge";
import { EvidenceBadge } from "@/components/shared/evidence-badge";
import { ValidatedBy } from "@/components/shared/validated-by";
import { validationStatusText } from "@/components/shared/validation-status";
import { formatTime } from "@/lib/format";
import type { PublicCase, PublicFinding } from "@/services/read-model/read-model.model";
import { localizedText } from "@/lib/localized";

export function CaseFields({ kase }: { kase: PublicCase }) {
  return (
    <dl className="case-fields" data-testid="case-fields">
      <div>
        <dt>Highest evidence status</dt>
        <dd>
          <EvidenceBadge status={kase.max_finding_status} />
        </dd>
      </div>
      <div>
        <dt>Reports / public signals</dt>
        <dd>
          {kase.report_count} / {kase.signal_count}
        </dd>
      </div>
      <div>
        <dt>Last update</dt>
        <dd>{formatTime(kase.updated_at)}</dd>
      </div>
    </dl>
  );
}

export function CaseFindings({ findings }: { findings: PublicFinding[] }) {
  return (
    <section aria-labelledby="case-findings">
      <h2 id="case-findings">Findings</h2>
      {findings.length === 0 ? (
        <p className="muted">No findings for this case yet.</p>
      ) : (
        <ul className="finding-list">
          {findings.map((f) => (
            <li key={f.finding_id} className="card finding-card" data-testid="finding">
              <div className="finding-head">
                <EvidenceBadge status={f.status} />
                <Badge variant="neutral">{validationStatusText(f.validation)}</Badge>
              </div>
              <p className="finding-statement">{localizedText(f.statement, f.statement_i18n)}</p>
              <ValidatedBy validation={f.validation} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
