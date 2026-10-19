import Link from "next/link";
import { EvidenceBadge } from "@/components/shared/evidence-badge";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { TableWrap } from "@/components/ui/table-wrap";
import { ROUTES } from "@/configs/routes.config";
import { formatTime } from "@/lib/format";
import type { FetchResult } from "@/services/http/fetch-json";
import type { ValidationRequest } from "@/services/trust/trust.model";
import { localizedText } from "@/lib/localized";

/** SCR-022: count tiles over the findings already loaded (no extra call). */
function QueueStats({ requests }: { requests: ValidationRequest[] }) {
  const oldest = requests.reduce<string | null>((min, r) => (min === null || r.received_at < min ? r.received_at : min), null);
  return (
    <ul className="ws-stats" aria-label="Queue summary">
      <li className="ws-stat">
        <span className="ws-stat__label">Waiting for my decision</span>
        <span className="ws-stat__value ws-stat__value--accent">{requests.length}</span>
      </li>
      <li className="ws-stat">
        <span className="ws-stat__label">Oldest received</span>
        <span className="ws-stat__value ws-stat__value--sm">{formatTime(oldest)}</span>
      </li>
    </ul>
  );
}

/** SCR-022: one table row per finding, nearest first as the service returns them; "Review and decide" opens SCR-020. */
export function ValidationQueue({ requests }: { requests: FetchResult<ValidationRequest[]> }) {
  if (!requests.ok) return <Callout tone="error">The validation service did not answer ({requests.error}).</Callout>;
  if (requests.data.length === 0) {
    return <Callout data-testid="queue-empty">Nothing to validate right now.</Callout>;
  }
  return (
    <>
      <QueueStats requests={requests.data} />
      <div className="ws-table">
        <TableWrap label="Findings waiting for validation">
          <table data-testid="validation-queue">
            <thead>
              <tr>
                <th scope="col">Finding</th>
                <th scope="col">Evidence status</th>
                <th scope="col">Case</th>
                <th scope="col">Received</th>
                <th scope="col">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {requests.data.map((r) => (
                <tr key={r.finding_id} data-testid="validation-item">
                  <td>
                    <p className="ws-queue-statement">{localizedText(r.statement, r.statement_i18n)}</p>
                    {r.synthetic ? (
                      <p className="ws-queue-meta">
                        <Badge tone="neutral" icon={false}>
                          Synthetic
                        </Badge>
                      </p>
                    ) : null}
                  </td>
                  <td>
                    <EvidenceBadge status={r.status_label} />
                  </td>
                  <td className="ws-muted-cell ws-nowrap">Case {r.case_id}</td>
                  <td className="ws-muted-cell ws-nowrap">received {formatTime(r.received_at)}</td>
                  <td>
                    <Link className="ws-action-link" href={ROUTES.validateFinding(r.finding_id)}>
                      Review and decide
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </div>
    </>
  );
}
