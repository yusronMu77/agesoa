import { Badge } from "@agesoa/ui/components/badge";
import { WorkspaceIcon } from "@/components/shared/workspace-icon";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/configs/routes.config";
import type { ValidatorProfile } from "@/services/trust/trust.model";

/** Who is deciding (role label + tier, never a name) and a SIMULASI band for seeded demo validators. */
export function ValidatorHeader({ profile }: { profile: ValidatorProfile }) {
  return (
    <div className="ws-identity" data-testid="validator-profile">
      {profile.synthetic ? (
        <p className="sim-inline" data-testid="validator-sim-band">
          <span lang="id">SIMULASI</span> — demo validator account (seeded, fictional)
        </p>
      ) : null}
      <p className="ws-identity__who">
        <span className="ws-identity__icon" aria-hidden="true">
          <WorkspaceIcon name="shield" size={22} />
        </span>
        <span>
          Signed in as <strong>{profile.role_label}</strong>
          {profile.tier ? ` · ${profile.tier} tier` : ""}
          {profile.organization ? ` · ${profile.organization}` : " · independent"} · status {profile.status}
          {profile.probation ? (
            <Badge variant="neutral" data-testid="probation-badge" style={{ marginLeft: 8 }}>
              New validator (probation)
            </Badge>
          ) : null}
        </span>
      </p>
      <form method="post" action={ROUTES.logout}>
        <Button variant="secondary">Sign out</Button>
      </form>
    </div>
  );
}
