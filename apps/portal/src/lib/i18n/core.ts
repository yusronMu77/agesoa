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

export function resolveLang(cookie: string | null | undefined, acceptLanguage: string | null | undefined): Lang {
  if (isLang(cookie)) return cookie;
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

/** BCP 47 tag for Intl formatting. */
export function intlLocale(lang: Lang): string {
  return lang === "id" ? "id-ID" : "en-GB";
}

/**
 * Date and time in Western Indonesia Time, as the design writes it: `16 Okt 2026, 10.42 WIB` / `16 Oct 2026, 10:42 WIB`.
 * Invalid input is returned unchanged so a bad timestamp never breaks a page.
 */
export function formatDateTime(lang: Lang, iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  const parts = new Intl.DateTimeFormat(intlLocale(lang), {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const month = get("month").replace(/\.$/, "");
  const sep = lang === "id" ? "." : ":";
  return `${get("day")} ${month} ${get("year")}, ${get("hour")}${sep}${get("minute")} WIB`;
}

export function formatNumber(lang: Lang, value: number): string {
  return new Intl.NumberFormat(intlLocale(lang)).format(value);
}
