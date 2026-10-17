import { BackLink, PageHeader } from "@/components/layout/page-header";
import { SimOrgBand } from "@/components/shared/simulation-band";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { ROUTES } from "@/configs/routes.config";
import { formatTime } from "@/lib/format";
import type { DnsResult } from "@/services/trust/trust.model";
import { DnsCheckResult, DomainVerification } from "../components/domain-verification";
import { InstitutionIntegration } from "../components/institution-integration";
import { StaffQueue } from "../components/staff-queue";
import { KIND_LABEL, STATUS_LABEL, statusTone } from "../constants";
import type { OrganizationData } from "../server/load-organizations";

export function OrganizationUnavailableView({ error }: { error: string }) {
  return <Callout tone="error">The trust service did not answer ({error}).</Callout>;
}

/**
 * One organization. What it shows follows its state: DNS instructions until verified (SCR-064/065), then the
 * staff queue of a newsroom (SCR-061) or the integration dashboard of an agency (SCR-062).
 */
export function OrganizationDetailView({
  organization: o,
  staff,
  institution,
  deliveries,
  check,
  staffDecided,
}: OrganizationData & { check?: DnsResult; staffDecided?: string }) {
  const verified = o.status === "verified";
  return (
    <>
      <SimOrgBand />
      <BackLink href={ROUTES.organizations}>Organizations</BackLink>
      <PageHeader
        bare
        aside={
          <Badge tone={statusTone(o.status)} icon={false} testId="organization-status">
            {STATUS_LABEL[o.status]}
          </Badge>
        }
      >
        <h1>{o.name}</h1>
      </PageHeader>
      <p className="muted">
        {KIND_LABEL[o.kind]} · <code>{o.domain}</code> · {o.region?.regency_name ?? "—"}
        {o.verified_at ? ` · verified ${formatTime(o.verified_at)}` : ""}
        {o.synthetic ? " · fictional (demo)" : ""}
      </p>

      {check ? <DnsCheckResult result={check} /> : null}

      {verified && o.kind === "newsroom" ? (
        <StaffQueue organizationId={o.organization_id} staff={staff} decided={staffDecided} />
      ) : institution?.ok ? (
        <InstitutionIntegration organizationId={o.organization_id} institution={institution.data} deliveries={deliveries} />
      ) : verified ? (
        <section aria-labelledby="next-heading" className="card">
          <h2 id="next-heading">Verified</h2>
          <p>Your agency is verified. Agencies do not confirm validators (they may be the audited party).</p>
        </section>
      ) : (
        <DomainVerification organization={o} />
      )}
    </>
  );
}
