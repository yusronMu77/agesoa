import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EvidenceBadge } from "@/components/EvidenceBadge";
import { SimOrgBand } from "@/components/SimOrgBand";
import { ValidatorHeader } from "@/components/ValidatorHeader";
import { loadConfig } from "@/lib/config";
import { formatTime } from "@/lib/format";
import { sessionToken } from "@/lib/session";
import { getMyProfile, listValidationRequests } from "@/lib/trust";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Validation" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ValidatePage({ searchParams }: { searchParams: SearchParams }) {
  const token = await sessionToken();
  if (!token) redirect("/login?next=/validate");
  const config = loadConfig();
  const [profile, requests] = await Promise.all([getMyProfile(config, token), listValidationRequests(config, token)]);
  if (!profile.ok && (profile.status === 401 || profile.status === null)) redirect("/login?next=/validate");
  const done = (await searchParams).done;

  return (
    <>
      <h1>Findings waiting for validation</h1>
      {config.demoMode ? <SimOrgBand /> : null}
      {profile.ok ? (
        <ValidatorHeader profile={profile.data} />
      ) : (
        <p className="callout callout--error" data-testid="not-validator">
          This account is not an active validator. <Link href="/validators/register">Become a validator</Link>.
        </p>
      )}
      {profile.ok && !["active", "probation"].includes(profile.data.status) ? (
        <p className="callout" data-testid="registration-pending">
          Your registration is {profile.data.status.replace("_", " ")}: see{" "}
          <Link href="/validators/register">your registration</Link>.
        </p>
      ) : null}
      {typeof done === "string" ? (
        <p className="callout" role="status" data-testid="decision-done">
          Decision recorded for finding <code>{done}</code>. It is in the public decision log.
        </p>
      ) : null}
      {profile.ok && !["active", "probation"].includes(profile.data.status) ? null : !requests.ok ? (
        <p className="callout callout--error">The validation service did not answer ({requests.error}).</p>
      ) : requests.data.length === 0 ? (
        <p className="callout" data-testid="queue-empty">
          Nothing to validate right now.
        </p>
      ) : (
        <ul className="finding-list" data-testid="validation-queue">
          {requests.data.map((r) => (
            <li key={r.finding_id} className="card" data-testid="validation-item">
              <div className="finding-head">
                <EvidenceBadge status={r.status_label} />
                {r.synthetic ? <span className="badge badge--neutral">Synthetic</span> : null}
              </div>
              <p className="finding-statement">{r.statement}</p>
              <p className="muted">
                Case {r.case_id} · received {formatTime(r.received_at)} ·{" "}
                <Link href={`/validate/${encodeURIComponent(r.finding_id)}`}>Review and decide</Link>
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
