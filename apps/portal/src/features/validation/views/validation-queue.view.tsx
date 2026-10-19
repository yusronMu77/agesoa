import Link from "next/link";
import { SimOrgBand } from "@/components/shared/simulation-band";
import { Callout } from "@/components/ui/callout";
import { ROUTES } from "@/configs/routes.config";
import { ValidationQueue } from "../components/validation-queue";
import { ValidatorHeader } from "../components/validator-header";
import { canDecide } from "../constants";
import type { ValidationQueueData } from "../server/load-validation";

/** SCR-022: findings waiting for this validator. `done` is the finding just decided. */
export function ValidationQueueView({ demoMode, profile, requests, done }: ValidationQueueData & { done?: string }) {
  const pending = profile.ok && !canDecide(profile.data.status);
  return (
    <>
      {demoMode ? <SimOrgBand /> : null}
      <div className="ws-intro">
        <h1>Findings waiting for validation</h1>
      </div>
      {profile.ok ? (
        <ValidatorHeader profile={profile.data} />
      ) : (
        <Callout tone="error" data-testid="not-validator">
          This account is not an active validator. <Link href={ROUTES.validatorRegister}>Become a validator</Link>.
        </Callout>
      )}
      {pending ? (
        <Callout data-testid="registration-pending">
          Your registration is {profile.data.status.replace("_", " ")}: see{" "}
          <Link href={ROUTES.validatorRegister}>your registration</Link>.
        </Callout>
      ) : null}
      {done !== undefined ? (
        <Callout role="status" data-testid="decision-done">
          Decision recorded for finding <code>{done}</code>. It is in the public decision log.
        </Callout>
      ) : null}
      {pending ? null : <ValidationQueue requests={requests} />}
    </>
  );
}
