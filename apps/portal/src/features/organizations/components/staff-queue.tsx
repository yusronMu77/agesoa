import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { formatTime } from "@/lib/format";
import type { FetchResult } from "@/services/http/fetch-json";
import type { StaffCandidate } from "@/services/trust/trust.model";
import { decideStaffCandidate } from "../actions";

/**
 * SCR-061: people who named this newsroom when registering as validators. Confirming states the affiliation only;
 * it is not a judgement on any finding. The document image is never shown, only what Agen Peran read.
 */
export function StaffQueue({
  organizationId,
  staff,
  decided,
}: {
  organizationId: string;
  staff: FetchResult<StaffCandidate[]> | null;
  decided?: string;
}) {
  return (
    <section aria-labelledby="staff-heading" className="card" data-testid="staff-queue">
      <h2 id="staff-heading">Staff waiting for your confirmation</h2>
      <p className="muted">
        People who named your newsroom when they registered as validators. Confirm only your own staff: a confirmed
        validator gets tier high. The document image is not kept; you see what Agen Peran read.
      </p>
      {decided !== undefined ? (
        <Callout role="status" data-testid="staff-result">
          {decided === "confirm" ? "Confirmed: the validator is now active (tier high, probation)." : "Refused."}
        </Callout>
      ) : null}
      {staff && staff.ok && staff.data.length > 0 ? (
        <ul className="ws-items">
          {staff.data.map((c) => (
            <li key={c.validator_id} className="ws-item" data-testid="staff-candidate">
              <p>
                <strong>{c.name ?? "Name not read"}</strong> · {c.position ?? "position not read"} · {c.role_label}
              </p>
              <p className="muted">
                {c.document_type ?? "document"} · read with confidence{" "}
                {c.confidence !== null ? `${Math.round(c.confidence * 100)}%` : "—"} · requested {formatTime(c.requested_at)}
              </p>
              <form action={decideStaffCandidate} className="inline-form ws-actions">
                <input type="hidden" name="organization_id" value={organizationId} />
                <input type="hidden" name="validator_id" value={c.validator_id} />
                <Button name="decision" value="confirm">
                  Confirm as our staff
                </Button>{" "}
                <Button name="decision" value="reject" variant="secondary">
                  Not our staff
                </Button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted" data-testid="staff-empty">
          Nobody is waiting for confirmation.
        </p>
      )}
    </section>
  );
}
