import type { PublicFinding } from "@/lib/readmodel";

type Decision = NonNullable<PublicFinding["validation"]>["decisions"][number];

/** "Journalist (high tier), Kabupaten …": who validated, by role and regency only, never by name. */
export function validatorLabel(d: Decision): string {
  const role = d.role_label ? `${d.role_label} (${d.tier} tier)` : `${d.tier} tier validator`;
  return d.regency_name ? `${role}, ${d.regency_name}` : role;
}

export function ValidatedBy({ validation }: { validation: PublicFinding["validation"] }) {
  if (!validation || validation.outcome !== "approved") return null;
  const approvals = validation.decisions.filter((d) => d.decision === "approve");
  return (
    <p className="muted" data-testid="validated-by">
      Validated by: {approvals.map(validatorLabel).join("; ")}
    </p>
  );
}
