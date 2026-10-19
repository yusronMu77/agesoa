import { Input } from "@agesoa/ui/components/input";
import { NativeSelect } from "@agesoa/ui/components/native-select";
import { RadioGroup, RadioGroupItem } from "@agesoa/ui/components/radio-group";
import { cn } from "@agesoa/ui/lib/utils";
import { useEffect, useMemo, useState } from "react";
import type { District, IngestionClient } from "../api";
import { Notice } from "../components";
import { T } from "../copy";
import type { Preferences } from "../prefs";
import { LANGUAGES, loadPreferences, savePreferences, SHORTLIST, suggestedLanguage } from "../prefs";
import { button } from "../ui";

/** SCR-009 Language and region: kept on this device only; a language without translations says so. */
export function Language({
  client,
  onDone,
}: {
  client: IngestionClient;
  /** Leaves the screen (after saving or cancelling). */
  onDone: () => void;
}) {
  const suggested = suggestedLanguage(globalThis.navigator?.language);
  const stored = useMemo(() => loadPreferences(), []);
  const [choice, setChoice] = useState<Preferences>(stored ?? { language: suggested, region: null });
  const [districts, setDistricts] = useState<District[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let live = true;
    client.districts().then(
      (list) => live && setDistricts(list),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [client]);

  const regencies = useMemo(() => {
    const seen = new Map<string, string>();
    for (const d of districts) if (d.regency_code && !seen.has(d.regency_code)) seen.set(d.regency_code, d.regency_name);
    return [...seen.entries()];
  }, [districts]);

  const search = query.trim().toLowerCase();
  const visible = search
    ? LANGUAGES.filter((l) => `${l.name} ${l.code}`.toLowerCase().includes(search))
    : LANGUAGES.filter((l) => SHORTLIST.includes(l.code) || l.code === choice.language);

  return (
    <main className="screen" data-screen="SCR-009">
      <div className="intro">
        <h1>{T["TXT-WIT-236"]}</h1>
        <p className="lead">{T["TXT-WIT-237"]}</p>
      </div>

      <section aria-labelledby="language-heading">
        <h2 id="language-heading">{T["TXT-WIT-240"]}</h2>
        <Input
          type="search"
          className="h-12"
          aria-label={T["TXT-WIT-194"]}
          placeholder={T["TXT-WIT-194"]}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <RadioGroup
          aria-labelledby="language-heading"
          value={choice.language}
          onValueChange={(language) => {
            setChoice((current) => ({ ...current, language: String(language) }));
          }}
        >
          {visible.length === 0 && <p className="lead">{T["TXT-WIT-199"]}</p>}
          {visible.map((language) => (
            <label
              key={language.code}
              className={cn("language-option", choice.language === language.code && "is-chosen")}
            >
              <span className="language-name">
                {language.name}
                {language.code === suggested && <span className="language-tag">{T["TXT-WIT-238"]}</span>}
              </span>
              {language.coverage === "planned" && <span className="field-hint">{T["TXT-WIT-245"]}</span>}
              <RadioGroupItem value={language.code} aria-label={language.name} />
            </label>
          ))}
        </RadioGroup>
      </section>

      <div className="field">
        <label className="field-label" htmlFor="region">
          {T["TXT-WIT-241"]}
        </label>
        <NativeSelect
          id="region"
          className="w-full"
          value={choice.region ?? ""}
          onChange={(event) => {
            setChoice((current) => ({ ...current, region: event.target.value || null }));
          }}
        >
          <option value="">{T["TXT-WIT-212"]}</option>
          {regencies.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </NativeSelect>
      </div>

      <Notice tone="info" title={T["TXT-WIT-220"]}>
        {T["TXT-WIT-239"]}
      </Notice>

      <div className="actions">
        <button
          type="button"
          className={button("primary", { wide: true })}
          onClick={() => {
            savePreferences(choice);
            onDone();
          }}
        >
          {T["TXT-WIT-242"]}
        </button>
        <button type="button" className={button("ghost", { wide: true })} onClick={onDone}>
          {T["TXT-WIT-243"]}
        </button>
      </div>
    </main>
  );
}
