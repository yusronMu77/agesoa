import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SimOrgBand } from "@/components/SimOrgBand";
import { loadConfig } from "@/lib/config";
import { errorDetail } from "@/lib/http";
import { KIND_LABEL, listMyOrganizations, registerOrganization, STATUS_LABEL } from "@/lib/organizations";
import { sessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Organizations" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function register(formData: FormData) {
  "use server";
  const token = await sessionToken();
  if (!token) redirect("/login?next=/organizations");
  const result = await registerOrganization(loadConfig(), token, {
    name: String(formData.get("name") ?? ""),
    kind: formData.get("kind") === "agency" ? "agency" : "newsroom",
    domain: String(formData.get("domain") ?? ""),
    region: { regency_name: String(formData.get("regency") ?? "") },
  });
  if (!result.ok) {
    const message =
      result.status === 409
        ? "This domain is already registered."
        : result.status === 422
          ? "Check the fields: the domain must be a domain name you control (e.g. newsroom.example.org)."
          : errorDetail(result);
    redirect(`/organizations?error=${encodeURIComponent(message)}`);
  }
  redirect(`/organizations/${encodeURIComponent(result.data.organization_id)}`);
}

export default async function OrganizationsPage({ searchParams }: { searchParams: SearchParams }) {
  const token = await sessionToken();
  if (!token) redirect("/login?next=/organizations");
  const config = loadConfig();
  const mine = await listMyOrganizations(config, token);
  if (!mine.ok && (mine.status === 401 || mine.status === null)) redirect("/login?next=/organizations");
  const error = (await searchParams).error;

  return (
    <>
      <SimOrgBand />
      <h1>Organizations</h1>
      <p className="muted">
        Newsrooms and government agencies prove they control their domain with a DNS TXT record. Only verified
        organizations can confirm staff as validators or receive audit reports.
      </p>
      {mine.ok ? null : (
        <p className="callout callout--error" data-testid="not-org-admin">
          This account is not an organization admin ({mine.error}).
        </p>
      )}

      <section aria-labelledby="mine-heading">
        <h2 id="mine-heading">Your organizations</h2>
        {mine.ok && mine.data.length > 0 ? (
          <div className="table-wrap" role="region" aria-label="Your organizations" tabIndex={0}>
            <table data-testid="organization-list">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Type</th>
                  <th scope="col">Domain</th>
                  <th scope="col">Regency</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {mine.data.map((o) => (
                  <tr key={o.organization_id}>
                    <td>
                      <Link href={`/organizations/${encodeURIComponent(o.organization_id)}`}>{o.name}</Link>
                    </td>
                    <td>{KIND_LABEL[o.kind]}</td>
                    <td>
                      <code>{o.domain}</code>
                    </td>
                    <td>{o.region?.regency_name ?? "—"}</td>
                    <td>
                      <span className={`badge ${o.status === "verified" ? "badge--ok" : "badge--warn"}`}>
                        {STATUS_LABEL[o.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted" data-testid="organization-empty">
            No organization registered yet.
          </p>
        )}
      </section>

      <section aria-labelledby="register-heading">
        <h2 id="register-heading">Register an organization</h2>
        {typeof error === "string" ? (
          <p className="callout callout--error" role="alert" data-testid="register-error">
            {error}
          </p>
        ) : null}
        <form action={register} className="card form" data-testid="register-form">
          <label>
            Name
            <input name="name" required minLength={2} maxLength={200} />
          </label>
          <fieldset>
            <legend>Type</legend>
            <label>
              <input type="radio" name="kind" value="newsroom" defaultChecked /> Newsroom
            </label>
            <label>
              <input type="radio" name="kind" value="agency" /> Government agency
            </label>
          </fieldset>
          <label>
            Domain (one you control)
            <input name="domain" required placeholder="newsroom.example.org" autoComplete="off" />
          </label>
          <label>
            Regency
            <input name="regency" required maxLength={120} />
          </label>
          <button type="submit" className="button">
            Register and get the TXT record
          </button>
        </form>
      </section>
    </>
  );
}
