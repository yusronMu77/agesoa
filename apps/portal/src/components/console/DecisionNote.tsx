"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * "Catatan putusan" of SCR-020. Asking for more evidence ("Butuh bukti") needs a note saying what is missing (trust
 * refuses a blank one), so the textarea becomes required while that option is checked; the server checks it too.
 */
export function DecisionNote({
  label,
  requiredHint,
  choiceName = "decision",
  requiredFor = "needs_evidence",
}: {
  label: string;
  /** Shown under the field while the note is required. */
  requiredHint: string;
  choiceName?: string;
  requiredFor?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [required, setRequired] = useState(false);
  const hintId = useId();

  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const update = () => {
      const checked = form.querySelector<HTMLInputElement>(`input[name="${choiceName}"]:checked`);
      setRequired(checked?.value === requiredFor);
    };
    update();
    form.addEventListener("change", update);
    return () => form.removeEventListener("change", update);
  }, [choiceName, requiredFor]);

  return (
    <label>
      {label}
      <textarea
        ref={ref}
        name="note"
        rows={5}
        maxLength={4000}
        required={required}
        aria-describedby={required ? hintId : undefined}
      />
      {required ? (
        <span className="field-hint field-hint--top" id={hintId}>
          {requiredHint}
        </span>
      ) : null}
    </label>
  );
}
