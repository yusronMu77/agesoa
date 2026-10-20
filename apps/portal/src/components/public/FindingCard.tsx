import { ChevronRight, CircleCheck, Clock, MapPin, Undo2 } from "lucide-react";
import Link from "next/link";
import { EvidenceBadge } from "@/components/EvidenceBadge";
import { ValidatedBy } from "@/components/ValidatedBy";
import type { Lang, Translate } from "@/lib/i18n/core";
import type { PublicFinding } from "@/lib/readmodel";
import { count, validationText } from "./text";
import { localizedText } from "@/lib/localized";

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
 * SCR-040 finding card: evidence badge, validation state, statement, district, the case it belongs to and a link to
 * its audit trail (the audit report when there is one, else the case's decision log).
 */
export function FindingCard({
  t,
  lang,
  finding: f,
  meta,
  hasReport,
}: {
  t: Translate;
  lang: Lang;
  finding: PublicFinding;
  /** Category of the case and its reports, e.g. "Food poisoning · 3 citizen reports". */
  meta?: string | null;
  hasReport: boolean;
}) {
  const statement = localizedText(lang, f.statement, f.statement_i18n);
  const caseHref = f.case_id ? `/cases/${encodeURIComponent(f.case_id)}` : null;
  const trailHref = caseHref ? (hasReport ? `${caseHref}/report` : `${caseHref}#case-log`) : null;
  const place = [f.region?.district_name ?? t("public.findings.unknownDistrict"), f.region?.regency_name]
    .filter(Boolean)
    .join(", ");
  return (
    <li className="card pub-finding" data-testid="finding">
      <div className="pub-finding__top">
        <div className="finding-head">
          <EvidenceBadge status={f.status} lang={lang} />
          <ValidationBadge t={t} validation={f.validation} />
          {f.synthetic ? <span className="badge badge--neutral">{t("public.findings.synthetic")}</span> : null}
        </div>
        {meta ? <span className="muted small">{meta}</span> : null}
      </div>
      <h3 className="finding-statement" lang={statement.lang}>
        {statement.text || "—"}
      </h3>
      <p className="muted small pub-finding__basis">{count(t, "evidence", f.evidence_count)}</p>
      <ValidatedBy validation={f.validation} lang={lang} />
      <div className="pub-finding__foot">
        <p className="muted small pub-place">
          <MapPin aria-hidden size={14} strokeWidth={2} />
          <span>{place}</span>
          {f.case_id && caseHref ? (
            <>
              <span aria-hidden="true">·</span>
              <Link href={caseHref}>{t("public.findings.case", { id: f.case_id })}</Link>
            </>
          ) : null}
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
