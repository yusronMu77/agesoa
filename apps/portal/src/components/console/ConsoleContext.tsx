"use client";

import { ChevronDown } from "lucide-react";
import { useId } from "react";

export interface ContextSelect {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
}

/**
 * Context selectors of the console topbar (agesoa-uiux "Pemilih konteks": small label over the value, chevron).
 * A GET form to `action`: choosing an option applies it at once (the hint says so, WCAG 3.2.2); without JavaScript
 * the apply button appears when focused. Selectors with a single option are informative (environment, scope).
 */
export function ConsoleContext({
  action,
  selects,
  label,
  applyLabel,
  hint,
  keep = {},
}: {
  action: string;
  selects: ContextSelect[];
  label: string;
  applyLabel: string;
  hint: string;
  keep?: Record<string, string>;
}) {
  const hintId = useId();
  return (
    <form className="console-context" action={action} method="get" aria-label={label}>
      {Object.entries(keep).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {selects.map((s) => (
        <label key={s.name} className="console-context__box">
          <span className="console-context__label">{s.label}</span>
          <select
            name={s.name}
            defaultValue={s.value}
            aria-describedby={hintId}
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
          >
            {s.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden size={20} strokeWidth={2} className="console-context__chevron" />
        </label>
      ))}
      <span id={hintId} className="sr-only">
        {hint}
      </span>
      <button type="submit" className="button button--secondary console-context__apply">
        {applyLabel}
      </button>
    </form>
  );
}
