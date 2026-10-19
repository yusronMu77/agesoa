import { SimOrgBand } from "@/components/shared/simulation-band";
import { Callout } from "@/components/ui/callout";
import { OrganizationTable, RegisterOrganizationForm } from "../components/organization-list";
import type { MyOrganizationsData } from "../server/load-organizations";

/** SCR-060: the organizations of this admin and the registration form. */
export function OrganizationsView({ mine, error }: MyOrganizationsData & { error?: string }) {
  return (
    <>
      <SimOrgBand />
      <div className="ws-intro">
        <h1>Organizations</h1>
        <p>
          Newsrooms and government agencies prove they control their domain with a DNS TXT record. Only verified
          organizations can confirm staff as validators or receive audit reports.
        </p>
      </div>
      {mine.ok ? null : (
        <Callout tone="error" data-testid="not-org-admin">
          This account is not an organization admin ({mine.error}).
        </Callout>
      )}

      <div className="ws-stack">
        <section aria-labelledby="mine-heading" className="card">
          <h2 id="mine-heading">Your organizations</h2>
          {mine.ok && mine.data.length > 0 ? (
            <div className="ws-table">
              <OrganizationTable organizations={mine.data} />
            </div>
          ) : (
            <p className="muted" data-testid="organization-empty">
              No organization registered yet.
            </p>
          )}
        </section>

        <section aria-labelledby="register-heading" className="card ws-narrow">
          <h2 id="register-heading">Register an organization</h2>
          {error !== undefined ? (
            <Callout tone="error" role="alert" data-testid="register-error">
              {error}
            </Callout>
          ) : null}
          <RegisterOrganizationForm />
        </section>
      </div>
    </>
  );
}
