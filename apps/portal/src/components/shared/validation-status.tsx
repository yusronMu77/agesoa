import { Badge } from "@agesoa/ui/components/badge";
import type { PublicFinding } from "@/services/read-model/read-model.model";

/** Where a finding stands with the human validators. */
export function validationStatusText(validation: PublicFinding["validation"]): string {
  if (!validation) return "Waiting for validation";
  return validation.outcome === "approved" ? `Validated by ${validation.decisions.length} people` : "Returned to the audit";
}

/** The same status as a pill: green once validated, amber when returned, neutral while waiting. */
export function ValidationStatusBadge({ validation }: { validation: PublicFinding["validation"] }) {
  const variant = !validation ? "neutral" : validation.outcome === "approved" ? "success" : "warning";
  return (
    <Badge variant={variant} data-testid="validation-status">
      {validationStatusText(validation)}
    </Badge>
  );
}
