import { SimOrgBand } from "@/components/shared/simulation-band";
import { Callout } from "@/components/ui/callout";
import { OrganizationTable, RegisterOrganizationForm } from "../components/organization-list";
import type { MyOrganizationsData } from "../server/load-organizations";

/** SCR-060: the organizations of this admin and the registration form. */
export function OrganizationsView({ mine, error }: MyOrganizationsData & { error?: string }) {
  return (
    <>
      <SimOrgBand />
      <h1>Organizations</h1>
      <p className="muted">
        Newsrooms and government agencies prove they control their domain with a DNS TXT record. Only verified
        organizations can confirm staff as validators or receive audit reports.
      </p>
      {mine.ok ? null : (
        <Callout tone="error" data-testid="not-org-admin">
          This account is not an organization admin ({mine.error}).
        </Callout>
      )}

      <section aria-labelledby="mine-heading">
        <h2 id="mine-heading">Your organizations</h2>
        {mine.ok && mine.data.length > 0 ? (
          <OrganizationTable organizations={mine.data} />
        ) : (
          <p className="muted" data-testid="organization-empty">
            No organization registered yet.
          </p>
        )}
      </section>

      <section aria-labelledby="register-heading">
        <h2 id="register-heading">Register an organization</h2>
        {error !== undefined ? (
          <Callout tone="error" role="alert" data-testid="register-error">
            {error}
          </Callout>
        ) : null}
        <RegisterOrganizationForm />
      </section>
    </>
  );
}
