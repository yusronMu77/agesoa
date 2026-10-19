import Link from "next/link";
import { CheckIcon } from "@/components/shared/icons";
import type { EvidenceStatus } from "@/services/read-model/read-model.model";
import { type DashboardFilters, filterHref } from "../lib/filters";

const CHIPS: { status: EvidenceStatus | null; label: string }[] = [
  { status: null, label: "All" },
  { status: "alleged", label: "Alleged" },
  { status: "supported", label: "Supported" },
  { status: "proven", label: "Proven" },
];

/** Penpot `Filter status bukti`: chips that narrow the finding list, and how many findings it shows. */
export function StatusFilter({ filters, shown }: { filters: DashboardFilters; shown: number }) {
  return (
    <div className="status-filter">
      <nav className="status-filter__chips" aria-labelledby="status-filter-label">
        <span id="status-filter-label">Evidence status</span>
        <ul>
          {CHIPS.map((chip) => {
            const current = filters.status === chip.status;
            return (
              <li key={chip.label}>
                <Link
                  href={filterHref(filters, { status: chip.status })}
                  className="chip"
                  aria-current={current ? "true" : undefined}
                  scroll={false}
                >
                  {current ? <CheckIcon /> : null}
                  {chip.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <p className="status-filter__count" role="status">
        {shown} {shown === 1 ? "finding" : "findings"}
      </p>
    </div>
  );
}
