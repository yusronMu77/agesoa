import { Check, ShieldCheck, X } from "lucide-react";
import { validatorLabel } from "@/components/ValidatedBy";
import { formatDateTime, type Lang, type Translate } from "@/lib/i18n/core";
import { type QuorumView, quorumOf } from "@/lib/publicview";
import type { PublicFinding } from "@/lib/readmodel";

/** The validations published for a case's findings (open decisions are published as counts only). */
export function validationsOf(findings: PublicFinding[]) {
  return findings.filter((f): f is PublicFinding & { validation: NonNullable<PublicFinding["validation"]> } =>
    Boolean(f.validation),
  );
}

/** "Kuorum 1 dari 2 validator" (open), or the final outcome in words. */
export function quorumText(t: Translate, q: QuorumView, finding: PublicFinding | null): string {
  const v = finding?.validation ?? null;
  if (v) {
    return v.outcome === "approved"
      ? t("public.validators.quorumMet", { n: q.approvals })
      : t("public.validators.returned", { n: v.decisions.length });
  }
  return q.state === "none" && q.approvals === 0
    ? t("public.validators.pending")
    : t("public.validators.quorum", { a: q.approvals, b: q.needed });
}

/**
 * Kuorum component: one dot per needed approval (filled with a check for each approval, a cross for a rejection in a
 * final validation) and the state in words. Open decisions are counts only, never names.
 */
export function QuorumLine({ t, finding }: { t: Translate; finding: PublicFinding | null }) {
  const q = quorumOf(finding);
  const v = finding?.validation ?? null;
  const dots: ("yes" | "no" | "open")[] = v
    ? v.decisions.map((d) => (d.decision === "approve" ? "yes" : "no"))
    : Array.from({ length: Math.max(q.needed, q.approvals) }, (_, i) => (i < q.approvals ? "yes" : "open"));
  return (
    <p className="pub-quorum" data-quorum={q.state}>
      {dots.map((d, i) => (
        <span
          key={i}
          className={`pub-quorum__dot${d === "yes" ? " pub-quorum__dot--yes" : d === "no" ? " pub-quorum__dot--no" : ""}`}
          aria-hidden="true"
        >
          {d === "yes" ? <Check size={16} strokeWidth={2.5} /> : d === "no" ? <X size={16} strokeWidth={2.5} /> : null}
        </span>
      ))}
      {quorumText(t, q, finding)}
    </p>
  );
}

/**
 * What the open validation still needs, as counts: approvals missing for the quorum, evidence requests (they do not
 * count towards the quorum) and the decision deadline. Nothing for a final validation.
 */
export function QuorumProgress({ t, lang, finding }: { t: Translate; lang: Lang; finding: PublicFinding | null }) {
  const q = quorumOf(finding);
  if (finding?.validation || q.state === "none") return null;
  const missing = Math.max(0, q.needed - q.approvals);
  return (
    <div className="pub-quorum-progress">
      {q.evidenceRequests > 0 ? (
        <p className="pub-quorum-progress__evidence" data-testid="needs-evidence">
          {t(q.evidenceRequests === 1 ? "public.validators.needsEvidence.one" : "public.validators.needsEvidence.other", {
            n: q.evidenceRequests,
          })}
        </p>
      ) : null}
      {missing > 0 ? (
        <p>{t(missing === 1 ? "public.validators.more.one" : "public.validators.more.other", { n: missing })}</p>
      ) : null}
      {q.deadline ? (
        <p className="muted small">
          {t("public.validators.deadline", { time: formatDateTime(lang, q.deadline) })}
        </p>
      ) : null}
    </div>
  );
}

/** Role chips of the validators who approved ("Journalist (high tier), Kabupaten …"), never names. */
export function ApprovalChips({ lang, finding }: { lang: Lang; finding: PublicFinding }) {
  const approvals = finding.validation?.decisions.filter((d) => d.decision === "approve") ?? [];
  if (approvals.length === 0) return null;
  return (
    <ul className="pub-role-chips">
      {approvals.map((d, i) => (
        <li key={i} className="pub-role-chip">
          <ShieldCheck aria-hidden size={14} strokeWidth={2} />
          {validatorLabel(d, lang)}
        </li>
      ))}
    </ul>
  );
}
