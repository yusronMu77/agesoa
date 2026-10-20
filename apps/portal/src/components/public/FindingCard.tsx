import { ChevronRight, CircleCheck, Clock, MapPin, Undo2 } from "lucide-react";
import Link from "next/link";
import { EvidenceBadge } from "@/components/EvidenceBadge";
import { ValidatedBy } from "@/components/ValidatedBy";
import type { Lang, Translate } from "@/lib/i18n/core";
import type { PublicFinding } from "@/lib/readmodel";
import { count, validationText } from "./text";
import { localizedText } from "@/lib/localized";
import { shortDistrictName } from "@/lib/publicview";
import { ROUTES } from "@/lib/routes";

/** Validation state badge of a finding; its text is the whole badge text (QA reads it as is). */
export function ValidationBadge({ t, validation }: { t: Translate; validation: PublicFinding["validation"] }) {
  const tone = !validation ? "neutral" : validation.outcome === "approved" ? "ok" : "warn";
  const Icon = !validation ? Clock : validation.outcome === "approved" ? CircleCheck : Undo2;
  return (
    <span className={`badge badge--${tone}`} data-testid="validation-status">
      <Icon aria-hidden size={14} strokeWidth={2} />
      {validationText(t, validation)}
    </span>
  );
}

/**
 * SCR-040 finding card: evidence badge with the issue type and case on the right, statement, what it is based on and
 * its validation state, the district and a link to its audit trail (the audit report when there is one, else the
 * case's decision log).
 */
export function FindingCard({
  t,
  lang,
  finding: f,
  category,
  reports,
  hasReport,
}: {
  t: Translate;
  lang: Lang;
  finding: PublicFinding;
  /** Issue category of the finding's case, e.g. "Food poisoning". */
  category?: string | null;
  /** Citizen reports of the finding's case, null when the case is not published. */
  reports?: number | null;
  hasReport: boolean;
}) {
  const statement = localizedText(lang, f.statement, f.statement_i18n);
  const caseHref = f.case_id ? ROUTES.case(f.case_id) : null;
  const trailHref = f.case_id && caseHref ? (hasReport ? ROUTES.caseReport(f.case_id) : `${caseHref}#case-log`) : null;
  const place = f.region?.district_name ? shortDistrictName(f.region.district_name) : t("public.findings.unknownDistrict");
  // "Berasal dari 9 laporan warga dan 2 item bukti." (Card temuan): reports of the case and the evidence items.
  const evidence = f.evidence_count > 0 ? count(t, "evidence", f.evidence_count) : null;
  const basis =
    reports !== null && reports !== undefined
      ? evidence
        ? t(reports === 1 ? "public.findings.basedOnWith.one" : "public.findings.basedOnWith.other", { n: reports, evidence })
        : `${t(reports === 1 ? "public.findings.basedOn.one" : "public.findings.basedOn.other", { n: reports })}. ${t("public.findings.noEvidence")}`
      : (evidence ?? t("public.findings.noEvidence"));
  return (
    <li className="pub-finding" data-testid="finding">
      <div className="pub-finding__top">
        <EvidenceBadge status={f.status} lang={lang} />
        <span className="pub-finding__meta">
          {category ? <span>{category}</span> : null}
          {category && f.case_id && caseHref ? <span aria-hidden="true"> · </span> : null}
          {f.case_id && caseHref ? <Link href={caseHref}>{t("public.findings.case", { id: f.case_id })}</Link> : null}
        </span>
      </div>
      <h3 className="pub-finding__statement" lang={statement.lang}>
        {statement.text || "—"}
      </h3>
      <p className="pub-finding__basis">
        {basis}.{" "}
        <span data-testid="validation-status">{validationText(t, f.validation, f.validation_state)}</span>.
      </p>
      <ValidatedBy validation={f.validation} lang={lang} />
      <div className="pub-finding__foot">
        <p className="pub-place">
          <MapPin aria-hidden size={14} strokeWidth={2} />
          <span>{place}</span>
        </p>
        {trailHref ? (
          <Link className="pub-more" href={trailHref}>
            {t("public.findings.viewTrail")}
            <ChevronRight aria-hidden size={16} strokeWidth={2} />
          </Link>
        ) : null}
      </div>
    </li>
  );
}
