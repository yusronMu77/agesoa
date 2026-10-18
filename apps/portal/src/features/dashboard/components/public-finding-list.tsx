import Link from "next/link";
import { EvidenceBadge } from "@/components/shared/evidence-badge";
import { ValidatedBy } from "@/components/shared/validated-by";
import { ValidationStatusBadge } from "@/components/shared/validation-status";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { ROUTES } from "@/configs/routes.config";
import type { PublicFinding } from "@/services/read-model/read-model.model";

/** Map pin before the district of a finding (decorative: the text names the district). */
function PinIcon() {
  return (
    <svg className="finding-meta__icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/** Audit findings with evidence status, validation and a link to their case. */
export function PublicFindingList({ findings }: { findings: PublicFinding[] }) {
  if (findings.length === 0) return <Callout>No findings published yet.</Callout>;
  return (
    <ul className="finding-list" data-testid="finding-list">
      {findings.map((f) => (
        <li key={f.finding_id} className="card finding-card" data-testid="finding">
          <div className="finding-head">
            <EvidenceBadge status={f.status} />
            <ValidationStatusBadge validation={f.validation} />
            {f.synthetic ? (
              <Badge tone="neutral" icon={false}>
                Synthetic
              </Badge>
            ) : null}
          </div>
          <p className="finding-statement">{f.statement ?? "—"}</p>
          <ValidatedBy validation={f.validation} />
          <p className="muted small finding-meta">
            <PinIcon />
            {f.region?.district_name ?? "Unknown district"}
            {f.region?.regency_name ? `, ${f.region.regency_name}` : ""} · {f.evidence_count} evidence item(s)
            {f.case_id ? (
              <>
                {" · "}
                <Link href={ROUTES.case(f.case_id)}>Case {f.case_id}</Link>
              </>
            ) : null}
          </p>
        </li>
      ))}
    </ul>
  );
}
