import { CircleHelp, FileText, ShieldCheck } from "lucide-react";
import { type Lang, translate } from "@/lib/i18n/core";
import type { EvidenceStatus } from "@/lib/readmodel";

const LABELS: Record<EvidenceStatus, string> = {
  alleged: "Alleged",
  supported: "Supported by evidence",
  proven: "Proven",
};

/** Same shape and icon on every screen (DESIGN-BRIEF §2.1): question mark, document, shield. */
const ICONS = { alleged: CircleHelp, supported: FileText, proven: ShieldCheck } as const;

/**
 * Evidence status of a finding (the legend on the about page explains each level). Without `lang` the label is
 * English, as before; with it, the label comes from the portal messages.
 */
export function EvidenceBadge({ status, lang }: { status: EvidenceStatus | null; lang?: Lang }) {
  if (!status) {
    return <span className="badge badge--neutral">{lang ? translate(lang, "public.evidence.none") : "No status yet"}</span>;
  }
  const Icon = ICONS[status];
  return (
    <span className={`badge badge--evidence badge--${status}`} data-testid="evidence-status">
      <Icon aria-hidden size={14} strokeWidth={2} />
      {lang ? translate(lang, `common.evidence.${status}`) : LABELS[status]}
    </span>
  );
}
