/**
 * SCR-009 Language and region: search the language catalogue, pick a language (kept on this device) and optionally
 * a region name. Availability is explicit: a language without texts in this app is kept as a preference only.
 */

import { useState } from "react";
import { Notice } from "../components";
import type { Language } from "../copy";
import { isLanguage, T, t } from "../copy";
import { Icon } from "../icons";
import { LANGUAGE_CATALOG, searchLanguages } from "../language";

export function LanguageRegion({
  current,
  suggested,
  regions,
  region: currentRegion,
  onSave,
  onCancel,
}: {
  /** The saved preference (any catalogue code). */
  current: string;
  /** From the device languages; only marked, never applied on its own. */
  suggested: Language;
  /** Region names on offer (from the district list); empty while unknown. */
  regions: string[];
  region: string | null;
  onSave: (code: string, region: string | null) => void;
  onCancel: () => void;
}) {
  const [choice, setChoice] = useState(current);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState(currentRegion ?? "");
  const found = searchLanguages(query);
  const regionOptions = region && !regions.includes(region) ? [region, ...regions] : regions;

  const availability = (code: string) => {
    if (!isLanguage(code)) return T["TXT-WIT-212"];
    return code === suggested ? `${T["TXT-WIT-211"]} · ${T["TXT-WIT-312"]}` : T["TXT-WIT-312"];
  };

  return (
    <main className="screen" data-screen="SCR-009">
      <div className="intro">
        <h1>{T["TXT-WIT-170"]}</h1>
        <p className="lead">{T["TXT-WIT-171"]}</p>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="language-search">
          {T["TXT-WIT-208"]}
        </label>
        <input
          id="language-search"
          type="search"
          autoComplete="off"
          placeholder={T["TXT-WIT-307"]}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <fieldset className="choices">
        <legend className="visually-hidden">{T["TXT-WIT-209"]}</legend>
        <p className="field-hint" role="status">
          {found.length === 0 ? T["TXT-WIT-213"] : t("TXT-WIT-308", { n: LANGUAGE_CATALOG.length })}
        </p>
        <div className="choice-list">
          {found.map((lang) => (
            <label key={lang.code} className="choice">
              <span className="choice-row">
                <input
                  type="radio"
                  name="language"
                  value={lang.code}
                  checked={choice === lang.code}
                  aria-describedby={`language-${lang.code}-note`}
                  onChange={() => setChoice(lang.code)}
                />
                <span className="choice-name" lang={lang.code}>
                  {lang.name}
                </span>
              </span>
              <span className="choice-note" id={`language-${lang.code}-note`}>
                {availability(lang.code)}
              </span>
            </label>
          ))}
        </div>
        {found.length > 3 && <p className="field-hint">{T["TXT-WIT-309"]}</p>}
      </fieldset>

      <div className="field">
        <label className="field-label" htmlFor="region">
          {T["TXT-WIT-314"]}
        </label>
        <span className={region ? "select" : "select select--placeholder"}>
          <select
            id="region"
            value={region}
            onChange={(event) => setRegion(event.target.value)}
          >
            <option value="">{T["TXT-WIT-315"]}</option>
            {regionOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <Icon name="chevronDown" className="select-chevron" />
        </span>
      </div>

      <Notice tone="info" title={T["TXT-WIT-316"]}>
        {T["TXT-WIT-173"]}
      </Notice>

      <div className="actions">
        <button type="button" className="button primary wide" onClick={() => onSave(choice, region || null)}>
          {T["TXT-WIT-214"]}
        </button>
        <button type="button" className="button ghost wide" onClick={onCancel}>
          {T["TXT-WIT-257"]}
        </button>
      </div>
    </main>
  );
}
