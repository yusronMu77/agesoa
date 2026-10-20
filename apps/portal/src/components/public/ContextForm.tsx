"use client";

import { ChevronDown } from "lucide-react";
import type { ChangeEvent } from "react";

export interface ContextSelect {
  name: string;
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
}

/**
 * SCR-040 context pickers (issue type, region). A choice is applied at once (the reader is told so before choosing,
 * WCAG 3.2.2); without JavaScript the hidden submit button inside <noscript> applies them.
 */
export function ContextForm({
  action,
  label,
  hint,
  applyLabel,
  status,
  selects,
  note,
}: {
  action: string;
  label: string;
  hint: string;
  applyLabel: string;
  status: string | null;
  selects: ContextSelect[];
  note: string | null;
}) {
  const submit = (event: ChangeEvent<HTMLSelectElement>) => event.currentTarget.form?.requestSubmit();
  return (
    <form className="pub-context" action={action} method="get" aria-label={label} aria-describedby="context-hint">
      <p id="context-hint" className="sr-only">
        {hint}
      </p>
      {selects.map((s) => (
        <div key={s.name} className="pub-context__box">
          <label htmlFor={s.id}>{s.label}</label>
          <select id={s.id} name={s.name} defaultValue={s.value} onChange={submit}>
            {s.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden size={18} strokeWidth={2} />
        </div>
      ))}
      {status ? <input type="hidden" name="status" value={status} /> : null}
      <noscript>
        <button className="button button--secondary" type="submit">
          {applyLabel}
        </button>
      </noscript>
      {note ? <p className="pub-context__note">{note}</p> : null}
    </form>
  );
}
