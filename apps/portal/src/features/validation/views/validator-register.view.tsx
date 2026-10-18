import { SimOrgBand } from "@/components/shared/simulation-band";
import { Callout } from "@/components/ui/callout";
import { RegisterForm, RegistrationStatus } from "../components/registration";
import type { RegistrationData } from "../server/load-validation";

/** SCR-021, SCR-024–026: become a validator; the form shows again only after a rejection. */
export function ValidatorRegisterView({ demoMode, me, roles, newsrooms, error }: RegistrationData & { error?: string }) {
  return (
    <>
      {demoMode ? <SimOrgBand /> : null}
      <div className="ws-split">
        <div className="ws-split__aside">
          <h1>Become a validator</h1>
          <p className="muted">
            Validators review audit findings before they become final. Upload one document that proves your role (press
            card, assignment letter or professional certificate). Agen Peran reads it; the image is not stored. Your
            name is never shown publicly: findings show only your role and regency.
          </p>
        </div>

        <div className="ws-split__main">
          {me ? <RegistrationStatus me={me} /> : null}

          {error !== undefined ? (
            <Callout tone="error" role="alert" data-testid="register-error">
              {error}
            </Callout>
          ) : null}

          {!me || me.status === "rejected" ? <RegisterForm roles={roles} newsrooms={newsrooms} /> : null}
        </div>
      </div>
    </>
  );
}
