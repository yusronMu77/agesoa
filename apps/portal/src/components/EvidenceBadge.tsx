import type { EvidenceStatus } from "@/lib/readmodel";

const LABELS: Record<EvidenceStatus, string> = {
  alleged: "Alleged",
  supported: "Supported by evidence",
  proven: "Proven",
};

/** Evidence status of a finding (the legend on the home page explains each level). */
export function EvidenceBadge({ status }: { status: EvidenceStatus | null }) {
  if (!status) return <span className="badge badge--neutral">No status yet</span>;
  return (
    <span className={`badge badge--evidence badge--${status}`} data-testid="evidence-status">
      {LABELS[status]}
    </span>
  );
}
