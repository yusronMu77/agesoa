/**
 * Portal languages. Indonesian is the design language; English is complete for every surface. The language comes
 * from the reader's choice (cookie, set by the language picker), else the browser's Accept-Language, else Indonesian.
 * Pure functions only, so they run on the server, in client components and in tests.
 */

import { messages, type MessageKey } from "./messages";

export const LANGS = ["id", "en"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "id";
export const LANG_COOKIE = "agesoa_lang";

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (LANGS as readonly string[]).includes(value);
}

/** First supported language in an Accept-Language header, by quality (`en-US,en;q=0.9,id;q=0.8` -> `en`). */
export function langFromAcceptLanguage(header: string | null | undefined): Lang | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const quality = q ? Number(q.slice(2)) : 1;
      return { base: (tag ?? "").toLowerCase().split("-")[0], quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((entry) => entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  for (const entry of ranked) {
    // "in" is the legacy ISO 639 code for Indonesian, still sent by some Android browsers.
    const base = entry.base === "in" ? "id" : entry.base;
    if (isLang(base)) return base;
  }
  return null;
}

/**
 * Language catalogue of the "Pilih bahasa" dialog (agesoa-uiux copy/locales/catalog.json): any listed language can be
 * chosen, but only LANGS have portal texts. A planned language is kept as the reader's preference and the portal is
 * shown in the base language (Indonesian) until its translation exists.
 */
export interface CatalogLanguage {
  /** BCP 47 code. */
  code: string;
  /** The name in the language itself. */
  nativeName: string;
  /** Indonesian name, for search. */
  nameId: string;
}

export const LANGUAGE_CATALOG: readonly CatalogLanguage[] = [
  { code: "id", nativeName: "Bahasa Indonesia", nameId: "Bahasa Indonesia" },
  { code: "en", nativeName: "English", nameId: "Bahasa Inggris" },
  { code: "su", nativeName: "Basa Sunda", nameId: "Bahasa Sunda" },
  { code: "jv", nativeName: "Basa Jawa", nameId: "Bahasa Jawa" },
  { code: "ms", nativeName: "Bahasa Melayu", nameId: "Bahasa Melayu" },
  { code: "ban", nativeName: "Bahasa Bali", nameId: "Bahasa Bali" },
  { code: "min", nativeName: "Bahasa Minangkabau", nameId: "Bahasa Minangkabau" },
  { code: "ace", nativeName: "Bahasa Aceh", nameId: "Bahasa Aceh" },
  { code: "bug", nativeName: "Bahasa Bugis", nameId: "Bahasa Bugis" },
  { code: "mad", nativeName: "Bahasa Madura", nameId: "Bahasa Madura" },
  { code: "bbc", nativeName: "Bahasa Batak Toba", nameId: "Bahasa Batak Toba" },
];

export function isCatalogLanguage(value: unknown): value is string {
  return typeof value === "string" && LANGUAGE_CATALOG.some((l) => l.code === value);
}

/** Catalogue entries matching a search by name (own or Indonesian) or code; all of them for an empty search. */
export function searchLanguages(query: string, catalog: readonly CatalogLanguage[] = LANGUAGE_CATALOG): CatalogLanguage[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return [...catalog];
  return catalog.filter(
    (l) =>
      l.code.toLowerCase().startsWith(q) ||
      l.nativeName.toLocaleLowerCase().includes(q) ||
      l.nameId.toLocaleLowerCase().includes(q),
  );
}

export function resolveLang(cookie: string | null | undefined, acceptLanguage: string | null | undefined): Lang {
  if (isLang(cookie)) return cookie;
  // A manual choice of a language without portal texts yet: the base language, not the browser's.
  if (isCatalogLanguage(cookie)) return DEFAULT_LANG;
  return langFromAcceptLanguage(acceptLanguage) ?? DEFAULT_LANG;
}

export type Vars = Record<string, string | number>;
export type Translate = (key: MessageKey, vars?: Vars) => string;

/** Message in `lang` (falls back to Indonesian), with `{name}` placeholders filled in. */
export function translate(lang: Lang, key: MessageKey, vars?: Vars): string {
  const template: string = messages[lang][key] ?? messages[DEFAULT_LANG][key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

export function translator(lang: Lang): Translate {
  return (key, vars) => translate(lang, key, vars);
}

/** BCP 47 tag for Intl formatting (numbers; dates go through the formatters below). */
export function intlLocale(lang: Lang): string {
  return lang === "id" ? "id-ID" : "en-US";
}

/** Every date and time in the portal is shown in Western Indonesia Time. */
export const DISPLAY_TIME_ZONE = "Asia/Jakarta";
const ZONE_LABEL = "WIB";

type DateParts = { day: string; month: string; year: string; hour: string; minute: string; second: string; period: string };

/** Calendar and clock parts in Asia/Jakarta; null for a missing or invalid timestamp. */
function jakartaParts(lang: Lang, iso: string): DateParts | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat(lang === "id" ? "id-ID" : "en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: lang === "id" ? "2-digit" : "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: lang !== "id",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    day: get("day"),
    month: get("month").replace(/\.$/, ""),
    year: get("year"),
    // Some ICU versions write midnight as "24" in 24-hour mode.
    hour: get("hour") === "24" ? "00" : get("hour"),
    minute: get("minute"),
    second: get("second"),
    period: get("dayPeriod").toUpperCase(),
  };
}

/** Calendar date in the reader's locale: `16 Okt 2026` (id) / `Oct 16, 2026` (en). */
function datePart(lang: Lang, p: DateParts): string {
  return lang === "id" ? `${p.day} ${p.month} ${p.year}` : `${p.month} ${p.day}, ${p.year}`;
}

/** Clock time in the reader's locale: `10.42` (id, 24-hour) / `10:42 AM` (en, 12-hour). */
function clockPart(lang: Lang, p: DateParts, seconds: boolean): string {
  const fields = [p.hour, p.minute, ...(seconds ? [p.second] : [])];
  return lang === "id" ? fields.join(".") : `${fields.join(":")} ${p.period}`;
}

/**
 * Date and time in Western Indonesia Time, as the design writes it (DESIGN-BRIEF multi-language):
 * `16 Okt 2026, 10.42 WIB` / `Oct 16, 2026, 10:42 AM WIB`.
 * Invalid input is returned unchanged so a bad timestamp never breaks a page.
 */
export function formatDateTime(lang: Lang, iso: string | null | undefined): string {
  if (!iso) return "—";
  const p = jakartaParts(lang, iso);
  return p ? `${datePart(lang, p)}, ${clockPart(lang, p, false)} ${ZONE_LABEL}` : String(iso);
}

export function formatNumber(lang: Lang, value: number): string {
  return new Intl.NumberFormat(intlLocale(lang)).format(value);
}

/**
 * Time of day in Western Indonesia Time: `10.42 WIB` / `10:42 AM WIB`, with `seconds`: `10.42.07 WIB` /
 * `10:42:07 AM WIB` (the latest-log panel of SCR-040, the operator console).
 */
export function formatTime(lang: Lang, iso: string | null | undefined, seconds = false): string {
  if (!iso) return "—";
  const p = jakartaParts(lang, iso);
  return p ? `${clockPart(lang, p, seconds)} ${ZONE_LABEL}` : String(iso);
}

/** Date in Western Indonesia Time without the time: `16 Okt 2026` / `Oct 16, 2026`. */
export function formatDate(lang: Lang, iso: string | null | undefined): string {
  if (!iso) return "—";
  const p = jakartaParts(lang, iso);
  return p ? datePart(lang, p) : String(iso);
}
