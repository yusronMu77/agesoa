import Link from "next/link";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { ROUTES } from "@/configs/routes.config";
import { CaseLog } from "../components/case-log";
import { CaseFields, CaseFindings } from "../components/case-summary";
import { FollowUpList, ReplyList } from "../components/institution-response";
import type { CaseData } from "../server/load-case";

/** One case: fields, findings, institution follow-up and right of reply, and its decision log. */
export function CaseDetailView({ caseId, kase, findings, entries, logError, verification }: CaseData) {
  return (
    <>
      <BackLink href={ROUTES.dashboard}>Public dashboard</BackLink>
      <PageHeader aside={kase?.status ? <Badge tone="neutral">Status: {kase.status}</Badge> : null}>
        <h1>Case {caseId}</h1>
        <p className="muted">
          {kase?.region?.district_name ?? "Unknown district"}
          {kase?.region?.regency_name ? `, ${kase.region.regency_name}` : ""}
          {kase?.category ? ` · ${kase.category}` : ""}
          {kase?.synthetic ? " · synthetic (demo) case" : ""}
        </p>
      </PageHeader>

      {kase ? <CaseFields kase={kase} /> : null}

      {kase?.audit_report ? (
        <p>
          <Link className={buttonClass()} href={ROUTES.caseReport(caseId)} data-testid="open-audit-report">
            Read the audit report
          </Link>
        </p>
      ) : null}

      <CaseFindings findings={findings} />
      <FollowUpList followUps={kase?.follow_ups} />
      <ReplyList replies={kase?.replies} />
      <CaseLog caseId={caseId} entries={entries} logError={logError} verification={verification} />
    </>
  );
}
