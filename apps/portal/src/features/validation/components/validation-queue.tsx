import Link from "next/link";
import { EvidenceBadge } from "@/components/shared/evidence-badge";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { ROUTES } from "@/configs/routes.config";
import { formatTime } from "@/lib/format";
import type { FetchResult } from "@/services/http/fetch-json";
import type { ValidationRequest } from "@/services/trust/trust.model";

export function ValidationQueue({ requests }: { requests: FetchResult<ValidationRequest[]> }) {
  if (!requests.ok) return <Callout tone="error">The validation service did not answer ({requests.error}).</Callout>;
  if (requests.data.length === 0) {
    return <Callout data-testid="queue-empty">Nothing to validate right now.</Callout>;
  }
  return (
    <ul className="finding-list" data-testid="validation-queue">
      {requests.data.map((r) => (
        <li key={r.finding_id} className="card" data-testid="validation-item">
          <div className="finding-head">
            <EvidenceBadge status={r.status_label} />
            {r.synthetic ? (
              <Badge tone="neutral" icon={false}>
                Synthetic
              </Badge>
            ) : null}
          </div>
          <p className="finding-statement">{r.statement}</p>
          <p className="muted">
            Case {r.case_id} · received {formatTime(r.received_at)} ·{" "}
            <Link href={ROUTES.validateFinding(r.finding_id)}>Review and decide</Link>
          </p>
        </li>
      ))}
    </ul>
  );
}
