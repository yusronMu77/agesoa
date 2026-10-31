"use client";

import { Check, ChevronDown, Globe, Search } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { isLang, LANGUAGE_CATALOG, searchLanguages } from "@/lib/i18n/core";
import { useLang, useT } from "@/lib/i18n/client";
import { ROUTES } from "@/lib/routes";

/**
 * "Pemilih bahasa" {Ink / Terang} in every header (components.md): the current language code opens the
 * "Pilih bahasa" dialog (PRV-language) with a searchable catalogue, the translation availability of each language
 * and Batal / Simpan pilihan. The dialog is a native popover with a GET form to /lang, so choosing a language works
 * without JavaScript; the search only narrows the list.
 *
 * `preference` is the reader's saved choice when it is a language without portal texts yet (shown in Indonesian).
 */
export function LanguagePicker({ tone = "light", preference }: { tone?: "light" | "ink"; preference?: string | null }) {
  const lang = useLang();
  const t = useT();
  const id = useId();
  const pathname = usePathname() ?? "/";
  const query = useSearchParams()?.toString();
  const back = query ? `${pathname}?${query}` : pathname;
  const chosen = preference && LANGUAGE_CATALOG.some((l) => l.code === preference) ? preference : lang;
  const [search, setSearch] = useState("");
  const shown = useMemo(() => new Set(searchLanguages(search).map((l) => l.code)), [search]);
  const popover = `${id}-languages`;
  const title = `${id}-title`;

  return (
    <div className={`lang-picker lang-picker--${tone}`} data-testid="language-picker">
      {/* The accessible name contains the visible code (WCAG 2.5.3): "Bahasa ID" / "Language EN". */}
      <button
        type="button"
        className="lang-picker__trigger"
        popoverTarget={popover}
        title={t("common.language.current", { lang: t(`common.language.${lang}`) })}
      >
        <Globe aria-hidden size={18} strokeWidth={2} />
        <span className="sr-only">{t("common.language.picker")} </span>
        <span>{chosen.toUpperCase()}</span>
        <ChevronDown aria-hidden size={16} strokeWidth={2} />
      </button>
      <div id={popover} popover="auto" role="dialog" aria-labelledby={title} className="lang-dialog">
        <form action={ROUTES.language} method="get" className="lang-dialog__form">
          <h2 id={title}>{t("common.language.dialog.title")}</h2>
          <p className="lang-dialog__body">{t("common.language.dialog.body")}</p>
          <input type="hidden" name="back" value={back} />
          <label className="lang-dialog__search">
            <span className="sr-only">{t("common.language.dialog.search")}</span>
            <Search aria-hidden size={16} strokeWidth={2} />
            <input
              type="search"
              placeholder={t("common.language.dialog.search")}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              autoComplete="off"
            />
          </label>
          <fieldset className="lang-dialog__list">
            <legend className="sr-only">{t("common.language.dialog.title")}</legend>
            {LANGUAGE_CATALOG.map((l) => {
              const available = isLang(l.code);
              return (
                <label key={l.code} className="lang-option" hidden={!shown.has(l.code)} data-available={available}>
                  <input type="radio" name="to" value={l.code} defaultChecked={l.code === chosen} />
                  <span className="lang-option__names">
                    <span lang={l.code} className="lang-option__native">
                      {l.nativeName}
                    </span>
                    {l.nameId !== l.nativeName ? <span className="lang-option__id">{l.nameId}</span> : null}
                  </span>
                  <span className={`lang-option__coverage${available ? " lang-option__coverage--ok" : ""}`}>
                    {available ? <Check aria-hidden size={14} strokeWidth={2} /> : null}
                    {available ? t("common.language.coverage.full") : t("common.language.coverage.planned")}
                  </span>
                </label>
              );
            })}
            {shown.size === 0 ? <p className="lang-dialog__empty">{t("common.language.dialog.empty")}</p> : null}
          </fieldset>
          <p className="lang-dialog__note">{t("common.language.coverage.plannedNote")}</p>
          <p className="lang-dialog__note">{t("common.locale.note")}</p>
          <div className="lang-dialog__actions">
            <button type="button" className="button button--secondary" popoverTarget={popover} popoverTargetAction="hide">
              {t("common.language.dialog.cancel")}
            </button>
            <button type="submit" className="button">
              {t("common.language.dialog.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
