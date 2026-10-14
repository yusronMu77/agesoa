import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SimOrgBand } from "@/components/SimOrgBand";
import { loadConfig } from "@/lib/config";
import { formatTime } from "@/lib/format";
import { checkDns, type DnsResult, getOrganization, KIND_LABEL, STATUS_LABEL } from "@/lib/organizations";
import { sessionToken } from "@/lib/session";

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
  const check = (await searchParams).check;

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

      {o.status === "verified" ? (
        <section aria-labelledby="next-heading" className="card">
          <h2 id="next-heading">Next</h2>
          <p>
            Your organization is verified. Staff who register as validators and name it will appear here for
            confirmation (validator registration is not open yet).
          </p>
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
