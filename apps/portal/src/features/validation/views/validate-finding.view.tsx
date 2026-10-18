import { BackLink } from "@/components/layout/page-header";
import { Callout } from "@/components/ui/callout";
import { ROUTES } from "@/configs/routes.config";
import { DecisionForm } from "../components/decision-form";
import { AuditTrail, FindingSummary } from "../components/finding-review";
import { ValidatorHeader } from "../components/validator-header";
import type { FindingDecisionData } from "../server/load-validation";

export function ValidationUnavailableView({ error }: { error: string }) {
  return <Callout tone="error">The validation service did not answer ({error}).</Callout>;
}

/** SCR-020: one finding, its audit trail and the decision form (closed once decided or once quorum is reached). */
export function ValidateFindingView({ profile, finding, trail, error }: Omit<FindingDecisionData, "error"> & { error?: string }) {
  const closed = finding.outcome !== null || finding.my_decision !== null;
  return (
    <>
      <BackLink href={ROUTES.validate} className="back-link">
        Findings waiting for validation
      </BackLink>
      <h1>Validate finding {finding.finding_id}</h1>
      {profile ? <ValidatorHeader profile={profile} /> : null}

      <div className="validate-layout">
        <div className="validate-main">
          <FindingSummary finding={finding} />
          <AuditTrail trail={trail} />
        </div>

        <section aria-labelledby="decide-heading" className="card validate-side">
          <h2 id="decide-heading">Your decision</h2>
          {error !== undefined ? (
            <Callout tone="error" role="alert" data-testid="decision-error">
              {error}
            </Callout>
          ) : null}
          {closed ? (
            <Callout data-testid="decision-closed">
              {finding.my_decision ? `You already decided: ${finding.my_decision}.` : `Validation closed: ${finding.outcome}.`}
            </Callout>
          ) : (
            <DecisionForm findingId={finding.finding_id} />
          )}
        </section>
      </div>
    </>
  );
}
