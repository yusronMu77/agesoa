import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SimOrgBand } from "@/components/SimOrgBand";
import { loadConfig } from "@/lib/config";
import { formatTime } from "@/lib/format";
import { checkDns, type DnsResult, getOrganization, KIND_LABEL, STATUS_LABEL } from "@/lib/organizations";
import { sessionToken } from "@/lib/session";
import { decideStaff, listStaff } from "@/lib/trust";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Organization" };

type Params = Promise<{ organizationId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const RESULT_TEXT: Record<DnsResult, string> = {
  verified: "Verified: the TXT record was found on your domain.",
  already_verified: "This domain is already verified.",
  no_record: "No AGESOA TXT record found yet. DNS changes can take a few minutes; try again.",
  token_mismatch: "A TXT record agesoa-verify=… exists but the token is different. Copy the value below exactly.",
  dns_error: "The DNS lookup failed. Try again in a moment.",
};

async function decideCandidate(formData: FormData) {
  "use server";
  const id = String(formData.get("organization_id"));
  const token = await sessionToken();
  if (!token) redirect(`/login?next=/organizations/${encodeURIComponent(id)}`);
  const decision = formData.get("decision") === "confirm" ? "confirm" : "reject";
  await decideStaff(loadConfig(), token, id, String(formData.get("validator_id")), decision);
  redirect(`/organizations/${encodeURIComponent(id)}?staff=${decision}`);
}

async function runCheck(formData: FormData) {
  "use server";
  const id = String(formData.get("organization_id"));
  const token = await sessionToken();
  if (!token) redirect(`/login?next=/organizations/${encodeURIComponent(id)}`);
  const result = await checkDns(loadConfig(), token, id);
  redirect(`/organizations/${encodeURIComponent(id)}?check=${result.ok ? result.data.result : "dns_error"}`);
}

export default async function OrganizationPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const id = decodeURIComponent((await params).organizationId);
  const token = await sessionToken();
  if (!token) redirect(`/login?next=/organizations/${encodeURIComponent(id)}`);
  const org = await getOrganization(loadConfig(), token, id);
  if (!org.ok && org.status === 404) notFound();
  if (!org.ok) return <p className="callout callout--error">The trust service did not answer ({org.error}).</p>;
  const o = org.data;
  const { check, staff: staffDone } = await searchParams;
  const staff = o.status === "verified" && o.kind === "newsroom" ? await listStaff(loadConfig(), token, o.organization_id) : null;

  return (
    <>
      <SimOrgBand />
      <p>
        <Link href="/organizations">← Organizations</Link>
      </p>
      <div className="page-header">
        <h1>{o.name}</h1>
        <span
          className={`badge ${o.status === "verified" ? "badge--ok" : "badge--warn"}`}
          data-testid="organization-status"
        >
          {STATUS_LABEL[o.status]}
        </span>
      </div>
      <p className="muted">
        {KIND_LABEL[o.kind]} · <code>{o.domain}</code> · {o.region?.regency_name ?? "—"}
        {o.verified_at ? ` · verified ${formatTime(o.verified_at)}` : ""}
        {o.synthetic ? " · fictional (demo)" : ""}
      </p>

      {typeof check === "string" && check in RESULT_TEXT ? (
        <p
          className={`callout ${check === "verified" || check === "already_verified" ? "" : "callout--error"}`}
          role="status"
          data-testid="dns-result"
        >
          {RESULT_TEXT[check as DnsResult]}
        </p>
      ) : null}

      {o.status === "verified" && o.kind === "newsroom" ? (
        <section aria-labelledby="staff-heading" className="card" data-testid="staff-queue">
          <h2 id="staff-heading">Staff waiting for your confirmation</h2>
          <p className="muted">
            People who named your newsroom when they registered as validators. Confirm only your own staff: a confirmed
            validator gets tier high. The document image is not kept; you see what Agen Peran read.
          </p>
          {typeof staffDone === "string" ? (
            <p className="callout" role="status" data-testid="staff-result">
              {staffDone === "confirm" ? "Confirmed: the validator is now active (tier high, probation)." : "Refused."}
            </p>
          ) : null}
          {staff && staff.ok && staff.data.length > 0 ? (
            <ul className="finding-list">
              {staff.data.map((c) => (
                <li key={c.validator_id} className="card" data-testid="staff-candidate">
                  <p>
                    <strong>{c.name ?? "Name not read"}</strong> · {c.position ?? "position not read"} · {c.role_label}
                  </p>
                  <p className="muted">
                    {c.document_type ?? "document"} · read with confidence{" "}
                    {c.confidence !== null ? `${Math.round(c.confidence * 100)}%` : "—"} · requested {formatTime(c.requested_at)}
                  </p>
                  <form action={decideCandidate} className="inline-form">
                    <input type="hidden" name="organization_id" value={o.organization_id} />
                    <input type="hidden" name="validator_id" value={c.validator_id} />
                    <button type="submit" name="decision" value="confirm" className="button">
                      Confirm as our staff
                    </button>{" "}
                    <button type="submit" name="decision" value="reject" className="button button--secondary">
                      Not our staff
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" data-testid="staff-empty">
              Nobody is waiting for confirmation.
            </p>
          )}
        </section>
      ) : o.status === "verified" ? (
        <section aria-labelledby="next-heading" className="card">
          <h2 id="next-heading">Verified</h2>
          <p>Your agency is verified. Agencies do not confirm validators (they may be the audited party).</p>
        </section>
      ) : (
        <section aria-labelledby="txt-heading" className="card">
          <h2 id="txt-heading">Prove that you control {o.domain}</h2>
          <ol>
            <li>
              In the DNS settings of <code>{o.domain}</code>, add a <strong>TXT</strong> record on the domain itself
              (host <code>@</code>) with this value:
              <pre className="txt-record" data-testid="txt-record">
                {o.txt_record}
              </pre>
            </li>
            <li>Wait a few minutes for DNS to update, then check:</li>
          </ol>
          <form action={runCheck}>
            <input type="hidden" name="organization_id" value={o.organization_id} />
            <button type="submit" className="button" data-testid="dns-check">
              Check DNS
            </button>
          </form>
        </section>
      )}
    </>
  );
}
