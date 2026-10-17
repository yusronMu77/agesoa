import { button, pill, notice } from "../ui";
/** SCR-005 Submitted: report code, evidence hashes, evidence deadline and how to keep the physical evidence. */

import type { Report } from "../api";
import { RegionName } from "../components";
import { EVIDENCE_KIND, T, t } from "../copy";
import { formatWib } from "../fields";

export function reportCode(report: Report): string {
  return `RPT-${report.id.slice(0, 12)}`; // same prefix as the report's entry in the public decision log
}

export function Submitted({ report, onNew }: { report: Report; onNew: () => void }) {
  const deadline = report.evidence_status;
  return (
    <main className="screen" data-screen="SCR-005">
      <h1>{T["TXT-WIT-110"]}</h1>
      <dl className="facts">
        <dt>{T["TXT-WIT-111"]}</dt>
        <dd className="mono" data-testid="report-code">
          {reportCode(report)}
        </dd>
        <dt>{T["TXT-WIT-116"]}</dt>
        <dd>
          <span className={pill("alleged")}>{T["TXT-EVD-001"]}</span>
        </dd>
      </dl>
      {report.region && <RegionName region={report.region} synthetic={report.synthetic} />}

      {report.evidence.length > 0 && (
        <section aria-labelledby="hash-heading">
          <h2 id="hash-heading">{T["TXT-WIT-112"]}</h2>
          <ul className="plain hashes">
            {report.evidence.map((e) => (
              <li key={e.evidence_id}>
                <span className="kind">{EVIDENCE_KIND[e.kind]}</span>
                <code data-testid="evidence-hash">{e.sha256}</code>
              </li>
            ))}
          </ul>
          <p className="field-hint">{T["TXT-WIT-113"]}</p>
        </section>
      )}

      {deadline?.status === "available" && deadline.deadline_at && (
        <section aria-labelledby="tips-heading" className="card" data-testid="evidence-tips">
          <h2 id="tips-heading">{t("TXT-WIT-114", { tenggat: formatWib(deadline.deadline_at) })}</h2>
          <ul>
            {report.evidence_tips.map((tip) => (
              <li key={tip.id}>{tip.id}</li>
            ))}
          </ul>
        </section>
      )}
      {deadline?.status === "likely_lost" && (
        <p className={notice("info")} data-testid="evidence-deadline-passed">
          {T["TXT-WIT-115"]}
        </p>
      )}

      <div className="actions">
        <button type="button" className={button("primary", { wide: true })} onClick={onNew}>
          {T["TXT-WIT-117"]}
        </button>
      </div>
    </main>
  );
}
