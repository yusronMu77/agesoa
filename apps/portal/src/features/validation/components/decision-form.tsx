import { Button } from "@/components/ui/button";
import { submitDecision } from "../actions";
import { CONFIDENCE_OPTIONS, NOTE_MAX_LENGTH } from "../constants";

/** SCR-020 decision: approve or reject, a public note, confidence, conflict of interest. Works without JavaScript. */
export function DecisionForm({ findingId }: { findingId: string }) {
  return (
    <form action={submitDecision} className="card form" data-testid="decision-form">
      <input type="hidden" name="finding_id" value={findingId} />
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
        <textarea name="note" rows={3} maxLength={NOTE_MAX_LENGTH} />
      </label>
      <label>
        How sure are you?
        <select name="confidence" defaultValue="">
          {CONFIDENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <input type="checkbox" name="conflict" /> I have a conflict of interest (recorded, not counted)
      </label>
      <Button>Submit decision</Button>
    </form>
  );
}
