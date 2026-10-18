import { EvidenceBadge } from "@agesoa/ui/components/evidence-badge";
import { HashText } from "@agesoa/ui/components/hash-text";
import { CheckIcon } from "lucide-react";
import { button } from "../ui";
/** SCR-005 Submitted: report code, evidence hashes, evidence deadline and how to keep the physical evidence. */

import type { Report } from "../api";
import { Notice, RegionName } from "../components";
import { EVIDENCE_KIND, T, t } from "../copy";
import { formatWib } from "../fields";

export function reportCode(report: Report): string {
  return `RPT-${report.id.slice(0, 12)}`; // same prefix as the entry of this report in the public decision log
}

export function Submitted({ report, onNew, onMine }: { report: Report; onNew: () => void; onMine: () => void }) {
  const deadline = report.evidence_status;
  return (
    <main className="screen" data-screen="SCR-005">
      <div className="success">
        <span className="success-icon" aria-hidden="true">
          <CheckIcon />
        </span>
        <h1>{T["TXT-WIT-110"]}</h1>
      </div>

      <section className="card receipt" aria-label={T["TXT-WIT-110"]}>
        <dl className="receipt-facts">
          <div>
            <dt>{T["TXT-WIT-111"]}</dt>
            <dd className="receipt-code" data-testid="report-code">
              {reportCode(report)}
            </dd>
          </div>
          {report.evidence.length > 0 && (
            <div>
              <dt id="hash-heading">{T["TXT-WIT-112"]}</dt>
              <dd>
                <ul className="plain hashes" aria-labelledby="hash-heading">
                  {report.evidence.map((e) => (
                    <li key={e.evidence_id}>
                      <span className="kind">{EVIDENCE_KIND[e.kind]}</span>
                      <HashText data-testid="evidence-hash">{e.sha256}</HashText>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
        </dl>
        {report.evidence.length > 0 && <p className="field-hint">{T["TXT-WIT-113"]}</p>}
        <div className="receipt-status">
          <span>{T["TXT-WIT-116"]}</span>
          <EvidenceBadge status="alleged">{T["TXT-EVD-001"]}</EvidenceBadge>
        </div>
        {report.region && <RegionName region={report.region} synthetic={report.synthetic} />}
      </section>

      {deadline?.status === "available" && deadline.deadline_at && (
        <Notice tone="warning" title={t("TXT-WIT-114", { tenggat: formatWib(deadline.deadline_at) })} testId="evidence-tips">
          <ul className="tips">
            {report.evidence_tips.map((tip) => (
              <li key={tip.id}>{tip.id}</li>
            ))}
          </ul>
        </Notice>
      )}
      {deadline?.status === "likely_lost" && (
        <Notice tone="info" testId="evidence-deadline-passed">
          {T["TXT-WIT-115"]}
        </Notice>
      )}

      <div className="actions">
        <button type="button" className={button("primary", { wide: true })} onClick={onNew}>
          {T["TXT-WIT-117"]}
        </button>
        <button type="button" className={button("neutral", { wide: true })} onClick={onMine}>
          {T["TXT-WIT-228"]}
        </button>
      </div>
    </main>
  );
}
