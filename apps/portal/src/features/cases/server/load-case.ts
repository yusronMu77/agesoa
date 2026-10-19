import { notFound } from "next/navigation";
import { loadConfig } from "@/configs/env.config";
import { createBackend } from "@/services/backend";
import { mergeEntries } from "../lib/case-log";

/** SCR-041/043 case page: the case, its findings, follow-ups, replies and every log entry behind them. */
export async function loadCase(caseId: string, verifyRequested: boolean) {
  const { readModel, transparency } = createBackend(loadConfig());
  const [caseDoc, findings] = await Promise.all([readModel.getCase(caseId), readModel.listFindings()]);
  const caseFindings = findings.ok ? findings.data.filter((f) => f.case_id === caseId) : [];
  if (caseDoc.ok && caseDoc.data === null && caseFindings.length === 0) notFound();

  const logs = await Promise.all([
    transparency.getLogForSubject("case", caseId),
    ...caseFindings.map((f) => transparency.getLogForSubject("finding", f.finding_id)),
  ]);
  return {
    caseId,
    kase: caseDoc.ok ? caseDoc.data : null,
    findings: caseFindings,
    entries: mergeEntries(logs.map((r) => (r.ok ? r.data : []))),
    logError: logs.some((r) => !r.ok),
    verification: verifyRequested ? await transparency.verifyLog() : null,
  };
}

export type CaseData = Awaited<ReturnType<typeof loadCase>>;

/** SCR-041 audit report: root causes, recommendations, validators and the log entries of the case. */
export async function loadAuditReport(caseId: string) {
  const { readModel, transparency } = createBackend(loadConfig());
  const [caseDoc, findings, log] = await Promise.all([
    readModel.getCase(caseId),
    readModel.listFindings(),
    transparency.getLogForSubject("case", caseId),
  ]);
  if (!caseDoc.ok) return { ok: false as const };
  const kase = caseDoc.data;
  if (!kase) notFound();
  return {
    ok: true as const,
    caseId,
    kase,
    report: kase.audit_report ?? null,
    findings: findings.ok ? findings.data.filter((f) => f.case_id === caseId) : [],
    log,
  };
}

export type AuditReportData = Extract<Awaited<ReturnType<typeof loadAuditReport>>, { ok: true }>;
