/** SCR-005 Submitted: report code, evidence hashes, evidence deadline and how to keep the physical evidence. */

import type { Report } from "../api";
import { EvidenceBadge, Notice, RegionName } from "../components";
import { evidenceKind, pick, T, t } from "../copy";
import { formatWib } from "../fields";
import { Icon } from "../icons";
import { reportCodeOf } from "../reports";

export function reportCode(report: Report): string {
  return reportCodeOf(report.id); // same prefix as the report's entry in the public decision log
}

export function Submitted({
  report,
  onNew,
  onMyReports,
}: {
  report: Report;
  onNew: () => void;
  onMyReports: () => void;
}) {
  const deadline = report.evidence_status;
  return (
    <main className="screen" data-screen="SCR-005">
      <div className="hero">
        <span className="hero-icon hero-icon--success">
          <Icon name="checkCircle" size={40} />
        </span>
        <h1>{T["TXT-WIT-110"]}</h1>
      </div>

      <section className="card receipt" aria-label={T["TXT-WIT-111"]}>
        <div>
          <p className="facts-label">{T["TXT-WIT-111"]}</p>
          <p className="code-lg" data-testid="report-code">
            {reportCode(report)}
          </p>
        </div>
        {report.evidence.length > 0 && (
          <div>
            <p className="facts-label" id="hash-heading">
              {T["TXT-WIT-112"]}
            </p>
            <ul className="hashes" aria-labelledby="hash-heading">
              {report.evidence.map((e) => (
                <li key={e.evidence_id}>
                  <span className="kind">{evidenceKind(e.kind)}</span>
                  <code data-testid="evidence-hash">{e.sha256}</code>
                </li>
              ))}
            </ul>
            <p className="field-hint">{T["TXT-WIT-113"]}</p>
          </div>
        )}
        <div className="status-row">
          <span>{T["TXT-WIT-116"]}</span>
          <EvidenceBadge level="alleged" />
        </div>
        {report.region && <RegionName region={report.region} synthetic={report.synthetic} />}
      </section>

      {deadline?.status === "available" && deadline.deadline_at && (
        <section aria-labelledby="tips-heading" className="callout callout--warning" data-testid="evidence-tips">
          <Icon name="alert" size={20} />
          <div className="callout-body">
            <h2 id="tips-heading" className="callout-title">
              {t("TXT-WIT-114", { tenggat: formatWib(deadline.deadline_at) })}
            </h2>
            <ul className="tips">
              {report.evidence_tips.map((tip) => (
                <li key={tip.id}>{pick(tip)}</li>
              ))}
            </ul>
          </div>
        </section>
      )}
      {deadline?.status === "likely_lost" && (
        <Notice tone="info" testId="evidence-deadline-passed">
          {T["TXT-WIT-115"]}
        </Notice>
      )}

      <div className="actions">
        <button type="button" className="button primary lg wide" onClick={onNew}>
          {T["TXT-WIT-117"]}
        </button>
        <button type="button" className="button wide" onClick={onMyReports}>
          {T["TXT-WIT-219"]}
        </button>
      </div>
    </main>
  );
}
