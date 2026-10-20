import { type Lang, translate } from "@/lib/i18n/core";
import type { MessageKey } from "@/lib/i18n/messages";
import type { PublicFinding } from "@/lib/readmodel";

type Decision = NonNullable<PublicFinding["validation"]>["decisions"][number];

const TIERS = new Set(["high", "medium", "low"]);

/**
 * "Journalist (high tier), Kabupaten …": who validated, by role and regency only, never by name. Without `lang` the
 * label is English, as before; the role label itself is data and is shown as published.
 */
export function validatorLabel(d: Decision, lang?: Lang): string {
  if (!lang) {
    const role = d.role_label ? `${d.role_label} (${d.tier} tier)` : `${d.tier} tier validator`;
    return d.regency_name ? `${role}, ${d.regency_name}` : role;
  }
  const tier = TIERS.has(d.tier) ? translate(lang, `public.tier.${d.tier}` as MessageKey) : d.tier;
  const role = d.role_label
    ? translate(lang, "public.validator.withRole", { role: d.role_label, tier })
    : translate(lang, "public.validator.noRole", { tier });
  return d.regency_name ? `${role}, ${d.regency_name}` : role;
}

export function ValidatedBy({ validation, lang }: { validation: PublicFinding["validation"]; lang?: Lang }) {
  if (!validation || validation.outcome !== "approved") return null;
  const approvals = validation.decisions.filter((d) => d.decision === "approve");
  const list = approvals.map((d) => validatorLabel(d, lang)).join("; ");
  return (
    <p className="muted" data-testid="validated-by">
      {lang ? translate(lang, "public.validatedBy", { list }) : `Validated by: ${list}`}
    </p>
  );
}
