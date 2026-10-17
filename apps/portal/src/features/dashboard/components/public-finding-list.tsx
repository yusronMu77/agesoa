import Link from "next/link";
import { EvidenceBadge } from "@/components/shared/evidence-badge";
import { ValidatedBy } from "@/components/shared/validated-by";
import { ValidationStatusBadge } from "@/components/shared/validation-status";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { ROUTES } from "@/configs/routes.config";
import type { PublicFinding } from "@/services/read-model/read-model.model";

/** Audit findings with evidence status, validation and a link to their case. */
export function PublicFindingList({ findings }: { findings: PublicFinding[] }) {
  if (findings.length === 0) return <Callout>No findings published yet.</Callout>;
  return (
    <ul className="finding-list" data-testid="finding-list">
      {findings.map((f) => (
        <li key={f.finding_id} className="card" data-testid="finding">
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
          <p className="muted">
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
