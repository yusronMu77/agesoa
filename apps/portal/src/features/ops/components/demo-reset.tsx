import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { runDemoReset } from "../actions";

export interface DemoResetResult {
  reset?: string;
  seconds?: string;
  error?: string;
}

function ResetResult({ reset, seconds, error }: DemoResetResult) {
  if (reset === "ok") {
    return (
      <Callout role="status" data-testid="reset-result">
        Demo reset done in {seconds} s: every service emptied its data and seeded its demo data again; the decision log
        restarted with a <code>demo.reset</code> entry and the public read model was rebuilt.
      </Callout>
    );
  }
  if (reset === "failed") {
    return (
      <Callout tone="error" role="alert" data-testid="reset-result">
        Demo reset failed after {seconds} s: {error ?? "unknown error"}
      </Callout>
    );
  }
  if (reset === "unconfirmed") {
    return (
      <Callout tone="error" role="alert" data-testid="reset-result">
        Tick the confirmation first.
      </Callout>
    );
  }
  return null;
}

/** Demo data reset (demo_mode only), behind a confirmation box. */
export function DemoResetPanel({ demoMode, result }: { demoMode: boolean; result: DemoResetResult }) {
  return (
    <section aria-labelledby="demo-heading" className="card" data-testid="demo-reset">
      <h2 id="demo-heading">Demo data</h2>
      <ResetResult {...result} />
      {demoMode ? (
        <form action={runDemoReset} className="form">
          <p className="muted">
            Puts the demo environment back to its starting state: removes all demo cases, reports, findings and
            decisions, then seeds the fictional organizations, validators and districts again. Demo only; the synthetic
            scenarios are sent afterwards with <code>scripts/demo/reset_demo.py</code>.
          </p>
          <label>
            <input type="checkbox" name="confirm" /> I understand that all demo data is removed
          </label>
          <Button variant="danger" data-testid="reset-button">
            Reset demo data
          </Button>
        </form>
      ) : (
        <p className="muted">Demo reset is only available in a demo environment.</p>
      )}
    </section>
  );
}
