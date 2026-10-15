import type { ValidatorProfile } from "@/lib/trust";

/** Who is deciding (role label + tier, never a name) and a SIMULASI band for seeded demo validators. */
export function ValidatorHeader({ profile }: { profile: ValidatorProfile }) {
  return (
    <div className="card validator-card" data-testid="validator-profile">
      {profile.synthetic ? (
        <p className="sim-inline" data-testid="validator-sim-band">
          <span lang="id">SIMULASI</span> — demo validator account (seeded, fictional)
        </p>
      ) : null}
      <p style={{ margin: 0 }}>
        Signed in as <strong>{profile.role_label}</strong>
        {profile.tier ? ` · ${profile.tier} tier` : ""}
        {profile.organization ? ` · ${profile.organization}` : " · independent"} · status {profile.status}
        {profile.probation ? (
          <span className="badge badge--neutral" data-testid="probation-badge" style={{ marginLeft: 8 }}>
            New validator (probation)
          </span>
        ) : null}
      </p>
      <form method="post" action="/logout">
        <button type="submit" className="button button--secondary">
          Sign out
        </button>
      </form>
    </div>
  );
}
