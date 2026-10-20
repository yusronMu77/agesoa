/** SCR-009 Language and region: pick the UI language (kept on this device) and see what is stored. */

import { useState } from "react";
import { Notice } from "../components";
import type { Language } from "../copy";
import { LANGUAGE_NAME, LANGUAGES, T } from "../copy";

export function LanguageRegion({
  current,
  suggested,
  onSave,
  onCancel,
}: {
  current: Language;
  /** From the device languages; only marked, never applied on its own. */
  suggested: Language;
  onSave: (lang: Language) => void;
  onCancel: () => void;
}) {
  const [choice, setChoice] = useState(current);
  return (
    <main className="screen" data-screen="SCR-009">
      <div className="intro">
        <h1>{T["TXT-WIT-250"]}</h1>
        <p className="lead">{T["TXT-WIT-251"]}</p>
      </div>

      <fieldset className="choices">
        <legend className="field-label">{T["TXT-WIT-253"]}</legend>
        {LANGUAGES.map((lang) => (
          <label key={lang} className="choice">
            <span className="choice-name" lang={lang}>
              {LANGUAGE_NAME[lang]}
            </span>
            {lang === suggested && <span className="choice-tag">{T["TXT-WIT-252"]}</span>}
            <input
              type="radio"
              name="language"
              value={lang}
              checked={choice === lang}
              onChange={() => setChoice(lang)}
            />
          </label>
        ))}
      </fieldset>

      <section aria-labelledby="region-heading">
        <h2 id="region-heading">{T["TXT-WIT-254"]}</h2>
        <p className="field-hint">{T["TXT-WIT-255"]}</p>
      </section>

      <Notice tone="info" title={T["TXT-WIT-216"]}>
        {T["TXT-WIT-256"]}
      </Notice>

      <div className="actions">
        <button type="button" className="button primary lg wide" onClick={() => onSave(choice)}>
          {T["TXT-WIT-067"]}
        </button>
        <button type="button" className="button ghost wide" onClick={onCancel}>
          {T["TXT-WIT-257"]}
        </button>
      </div>
    </main>
  );
}
