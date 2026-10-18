import Link from "next/link";
import { EvidenceBadge } from "@/components/shared/evidence-badge";
import { ChevronRightIcon, MapPinIcon } from "@/components/shared/icons";
import { ValidatedBy } from "@/components/shared/validated-by";
import { ValidationStatusBadge } from "@/components/shared/validation-status";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { ROUTES } from "@/configs/routes.config";
import type { PublicCase, PublicFinding } from "@/services/read-model/read-model.model";
import { shortDistrictName } from "../lib/district-map";
import { humanize } from "../lib/filters";

/** "Kitchen hygiene · 3 reports": the issue type and size of the finding's case (top right of the card). */
function caseLine(c: PublicCase | undefined): string | null {
  if (!c) return null;
  const parts = [c.category ? humanize(c.category) : null, `${c.report_count} ${c.report_count === 1 ? "report" : "reports"}`];
  return parts.filter(Boolean).join(" · ");
}

/** Penpot `Card temuan`: evidence status, the finding as the title, its basis, district and the way to its case. */
export function PublicFindingList({ findings, caseById }: { findings: PublicFinding[]; caseById: Map<string, PublicCase> }) {
  if (findings.length === 0) return <Callout>No findings match these filters yet.</Callout>;
  return (
    <ul className="finding-list" data-testid="finding-list">
      {findings.map((f) => {
        const line = caseLine(f.case_id ? caseById.get(f.case_id) : undefined);
        return (
          <li key={f.finding_id} className="finding-card" data-testid="finding">
            <div className="finding-card__top">
              <div className="finding-head">
                <EvidenceBadge status={f.status} />
                <ValidationStatusBadge validation={f.validation} />
                {f.synthetic ? (
                  <Badge tone="neutral" icon={false}>
                    Synthetic
                  </Badge>
                ) : null}
              </div>
              {line ? <span className="finding-card__case">{line}</span> : null}
            </div>
            <div className="finding-card__body">
              <h3 className="finding-statement">{f.statement ?? "—"}</h3>
              <p className="finding-card__basis">
                Based on {f.evidence_count} evidence {f.evidence_count === 1 ? "item" : "items"}.
              </p>
              <ValidatedBy validation={f.validation} />
            </div>
            <div className="finding-card__foot">
              <span className="finding-card__where">
                <MapPinIcon />
                {f.region?.district_name ? shortDistrictName(f.region.district_name) : "Unknown district"}
                {f.region?.regency_name ? `, ${f.region.regency_name}` : ""}
              </span>
              {f.case_id ? (
                <Link href={ROUTES.case(f.case_id)} className="finding-card__link">
                  View audit trail<span className="sr-only"> for Case {f.case_id}</span>
                  <ChevronRightIcon />
                </Link>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
