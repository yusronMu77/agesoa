import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { TableWrap } from "@/components/ui/table-wrap";
import { ROUTES } from "@/configs/routes.config";
import { formatTime, shortHash } from "@/lib/format";
import type { FetchResult } from "@/services/http/fetch-json";
import type { LogEntry, LogVerification } from "@/services/transparency/transparency.model";
import { decisionOf } from "../lib/case-log";

function VerifyResult({ verification }: { verification: FetchResult<LogVerification> }) {
  if (!verification.ok) {
    return (
      <Callout tone="error" data-testid="verify-result">
        Verification unavailable ({verification.error}).
      </Callout>
    );
  }
  const v = verification.data;
  return v.ok ? (
    <Callout data-testid="verify-result">
      <Badge tone="ok">Chain verified</Badge> All {v.length} entries recomputed; head <code>{shortHash(v.head_hash)}</code>.
    </Callout>
  ) : (
    <Callout tone="error" data-testid="verify-result">
      <Badge tone="error">Chain broken</Badge> at entry #{v.first_invalid_seq}: {v.reason}
    </Callout>
  );
}

/** Every decision on the case with actor and reason; "Verify chain" recomputes the whole log (GET, no JS). */
export function CaseLog({
  caseId,
  entries,
  logError,
  verification,
}: {
  caseId: string;
  entries: LogEntry[];
  logError: boolean;
  verification: FetchResult<LogVerification> | null;
}) {
  return (
    <section aria-labelledby="case-log">
      <PageHeader
        aside={
          <form method="get" action={ROUTES.case(caseId)}>
            <input type="hidden" name="verify" value="1" />
            <Button data-testid="verify-chain">Verify chain</Button>
          </form>
        }
      >
        <h2 id="case-log">Decision log for this case</h2>
        <p className="muted">
          Every step with its actor (agent, rule or human role), reason and evidence references. The whole chain can be
          recomputed by anyone.
        </p>
      </PageHeader>
      {verification ? <VerifyResult verification={verification} /> : null}
      {logError ? <Callout tone="error">Part of the log could not be loaded.</Callout> : null}
      {entries.length === 0 ? (
        <p className="muted">No decisions recorded for this case yet.</p>
      ) : (
        <TableWrap label="Decision log for this case">
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
                      <Link href={ROUTES.logEntry(e.seq)}>#{e.seq}</Link>
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
        </TableWrap>
      )}
    </section>
  );
}
