import type { Translate } from "@/lib/i18n/core";
import { ROUTES } from "@/lib/routes";

/**
 * Where the links of the case pages (SCR-043 case, SCR-041 audit report) go: the public pages, or the pages of one
 * console, so a validator or an organization reading a case never leaves their console.
 */
export interface CaseLinks {
  /** Breadcrumb links before the case id. */
  crumbs: { href: string; label: string }[];
  case: string;
  report: string;
  /** The decision log: an entry is `${log}/${seq}`. */
  log: string;
}

export function publicCaseLinks(caseId: string, t: Translate): CaseLinks {
  return {
    crumbs: [{ href: ROUTES.home, label: t("public.nav.findings") }],
    case: ROUTES.case(caseId),
    report: ROUTES.caseReport(caseId),
    log: ROUTES.log,
  };
}

/** A finding's case in the validator console: back to the queue and the finding. */
export function validatorCaseLinks(findingId: string, t: Translate): CaseLinks {
  return {
    crumbs: [
      { href: ROUTES.validator, label: t("console.validator.nav.queue") },
      { href: ROUTES.validatorFinding(findingId), label: findingId },
    ],
    case: ROUTES.validatorFindingCase(findingId),
    report: ROUTES.validatorFindingReport(findingId),
    log: ROUTES.validatorLog,
  };
}

/** A delivered case in the organization console: back to the integration page that lists the deliveries. */
export function organizationCaseLinks(organizationId: string, caseId: string, t: Translate): CaseLinks {
  return {
    crumbs: [{ href: ROUTES.organization(organizationId), label: t("console.institution.nav.integration") }],
    case: ROUTES.organizationCase(organizationId, caseId),
    report: ROUTES.organizationCaseReport(organizationId, caseId),
    log: ROUTES.institutionLog,
  };
}
