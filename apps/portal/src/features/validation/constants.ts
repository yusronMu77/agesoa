/** Validator statuses that may decide on findings. */
export const DECIDING_STATUSES = ["active", "probation"];

export function canDecide(status: string): boolean {
  return DECIDING_STATUSES.includes(status);
}

/** Plain-language reason codes of a rejected registration. */
export const REJECTION_TEXT: Record<string, string> = {
  expired: "the document has expired",
  issuer_mismatch: "the document was not issued by the organization you named",
  audited_party: "a government agency cannot confirm validators (it may be the audited party)",
  low_confidence: "the document could not be read with enough confidence",
  unreadable: "the document could not be read",
  not_confirmed: "the newsroom did not confirm you as staff",
};

/** "How sure are you?" in the decision form; the value is sent as `confidence`. */
export const CONFIDENCE_OPTIONS = [
  { value: "", label: "Not stated" },
  { value: "0.9", label: "Very sure" },
  { value: "0.7", label: "Fairly sure" },
  { value: "0.5", label: "Unsure" },
];

/** The longest note trust accepts. */
export const NOTE_MAX_LENGTH = 4000;

/** Image types Agen Peran can read. */
export const DOCUMENT_TYPES = "image/jpeg,image/png,image/webp";
