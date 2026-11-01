import "@/app/(public)/public.css";

import { notFound, redirect } from "next/navigation";
import { CaseReportView } from "@/components/case/CaseReportView";
import { CaseView } from "@/components/case/CaseView";
import { InstitutionConsole, ValidatorConsole } from "@/components/console/Consoles";
import { type CaseLinks, organizationCaseLinks, validatorCaseLinks } from "@/lib/case-links";
import { loadConfig } from "@/lib/config";
import { getT } from "@/lib/i18n/server";
import { getOrganization, isVerifiedAgency } from "@/lib/organizations";
import { ROUTES, signInHref } from "@/lib/routes";
import { sessionToken } from "@/lib/session";
import { getMyProfile, getValidationRequest } from "@/lib/trust";

// SCR-043 / SCR-041 inside a console: the case and its audit report open in the console shell (sidebar, identity),
// with every link of the page leading to the same console.

type View = { report?: boolean; verify?: boolean };

/** The case page or its audit report with the console's links, and `self`: where signing in returns to. */
function consoleView(caseId: string, links: CaseLinks, { report = false, verify = false }: View) {
  return {
    self: report ? links.report : links.case,
    body: report ? <CaseReportView caseId={caseId} links={links} /> : <CaseView caseId={caseId} verify={verify} links={links} />,
  };
}

/** A finding's case (`report`: its audit report) in the validator console; the finding must be in the validator's queue. */
export async function ValidatorCase({ findingId, ...view }: View & { findingId: string }) {
  const { t } = await getT();
  const links = validatorCaseLinks(findingId, t);
  const { self } = consoleView(findingId, links, view);
  const token = await sessionToken();
  if (!token) redirect(signInHref(self));
  const config = loadConfig();
  // trust answers only for a finding this session may validate.
  const [profile, detail] = await Promise.all([getMyProfile(config, token), getValidationRequest(config, token, findingId)]);
  if (!profile.ok && (profile.status === 401 || profile.status === null)) redirect(signInHref(self));
  if (!detail.ok && detail.status === 404) notFound();
  return (
    <ValidatorConsole profile={profile.ok ? profile.data : null} section="queue">
      {!detail.ok ? (
        <p className="callout callout--error">{t("decide.unavailable", { error: detail.error })}</p>
      ) : (
        consoleView(detail.data.case_id, links, view).body
      )}
    </ValidatorConsole>
  );
}

/** A case delivered to a verified agency (`report`: its audit report) in the organization console. */
export async function OrganizationCase({ organizationId, caseId, ...view }: View & { organizationId: string; caseId: string }) {
  const { t } = await getT();
  const { self, body } = consoleView(caseId, organizationCaseLinks(organizationId, caseId, t), view);
  const token = await sessionToken();
  if (!token) redirect(signInHref(self));
  const org = await getOrganization(loadConfig(), token, organizationId);
  if (!org.ok && org.status === 404) notFound();
  // Same rule as the delivery history that links here.
  if (!org.ok || !isVerifiedAgency(org.data)) redirect(ROUTES.organization(organizationId));
  return (
    <InstitutionConsole organization={org.data} section="inbox">
      {body}
    </InstitutionConsole>
  );
}
