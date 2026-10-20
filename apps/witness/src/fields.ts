/**
 * Converting report field values (as the service stores them) to form inputs and back. Generic over the domain
 * pack: field types and list vocabularies come from the pack, nothing here knows a domain.
 *
 * Times are entered and shown in the reporter's local zone (WIB, Asia/Jakarta) whatever the device zone is.
 */

import type { FieldType, FieldValue, PackDocument } from "./api";

export const TZ = "Asia/Jakarta";
const TZ_OFFSET = "+07:00";

const wallClock = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** ISO datetime with any offset -> `YYYY-MM-DDTHH:mm` in WIB (value of an <input type="datetime-local">). */
export function toLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(wallClock.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** `YYYY-MM-DDTHH:mm` typed in WIB -> ISO with +07:00. */
export function fromLocalInput(value: string): string | null {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00${TZ_OFFSET}` : null;
}

type Lang = "id" | "en";

const LOCALE: Record<Lang, string> = { id: "id-ID", en: "en-US" };
const partFormats = new Map<string, Intl.DateTimeFormat>();

/** Named parts of a date in WIB ("16", "Okt", "2026", "10", "42", "Jumat"; en also "AM"). */
function wibParts(iso: string, lang: Lang): Record<string, string> {
  let format = partFormats.get(lang);
  if (!format) {
    format = new Intl.DateTimeFormat(LOCALE[lang], {
      timeZone: TZ,
      weekday: "long",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: lang === "en" ? "numeric" : "2-digit",
      minute: "2-digit",
      hourCycle: lang === "en" ? "h12" : "h23",
    });
    partFormats.set(lang, format);
  }
  return Object.fromEntries(format.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
}

/** The calendar day in WIB per locale (agesoa-uiux DESIGN-BRIEF): "16 Okt 2026" / "Oct 16, 2026". */
export function formatDay(iso: string, lang: Lang = "id"): string {
  const p = wibParts(iso, lang);
  return lang === "en" ? `${p.month} ${p.day}, ${p.year}` : `${p.day} ${p.month} ${p.year}`;
}

/**
 * Date and time in WIB per locale: "16 Okt 2026, 10.42 WIB" / "Oct 16, 2026, 10:42 AM WIB". `weekday` prefixes the
 * day name, for deadlines (SCR-005 mockup "Sabtu, 17 Okt 2026 10.30 WIB").
 */
export function formatWib(iso: string, lang: Lang = "id", { weekday = false } = {}): string {
  const p = wibParts(iso, lang);
  const time = lang === "en" ? `${p.hour}:${p.minute} ${p.dayPeriod}` : `${p.hour}.${p.minute}`;
  return `${weekday ? `${p.weekday}, ` : ""}${formatDay(iso, lang)}, ${time} WIB`;
}

type Vocabulary = Record<string, string[]>;

export function vocabularyOf(pack: PackDocument, fieldId: string): Vocabulary | undefined {
  return pack.intake_hints?.fields?.[fieldId]?.vocabulary;
}

/** Canonical list values are shown with the pack's first local word ("nausea" -> "mual"). */
export function displayWord(value: string, vocabulary?: Vocabulary): string {
  return vocabulary?.[value]?.[0] ?? value;
}

/** A typed word maps back to its canonical value when the pack knows it; other words are kept as typed. */
export function canonicalWord(word: string, vocabulary?: Vocabulary): string {
  const lower = word.trim().toLowerCase();
  if (!vocabulary) return word.trim();
  for (const [canonical, synonyms] of Object.entries(vocabulary)) {
    if (canonical === lower || synonyms.includes(lower)) return canonical;
  }
  return word.trim();
}

export function toInput(type: FieldType, value: FieldValue | undefined, vocabulary?: Vocabulary): string {
  if (value === undefined || value === null) return "";
  switch (type) {
    case "datetime":
      return toLocalInput(String(value));
    case "string_list":
      return (Array.isArray(value) ? value : [String(value)]).map((v) => displayWord(v, vocabulary)).join(", ");
    default:
      return String(value);
  }
}

/**
 * Form input -> value for a PATCH. Empty input is null (removes the value). A value the service will refuse is
 * passed through unchanged so the service's validation message reaches the reporter.
 */
export function fromInput(type: FieldType, input: string, vocabulary?: Vocabulary): FieldValue | null {
  const text = input.trim();
  if (!text) return null;
  switch (type) {
    case "datetime":
      return fromLocalInput(text) ?? text;
    case "integer":
      return /^\d+$/.test(text) ? Number(text) : text;
    case "string_list": {
      const items = text
        .split(",")
        .map((w) => canonicalWord(w, vocabulary))
        .filter(Boolean);
      return [...new Set(items)];
    }
    default:
      return text;
  }
}

export function sameValue(a: FieldValue | null | undefined, b: FieldValue | null | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Field id named in a service validation message ("fields: affected_count: expected a whole number"). */
export function fieldInError(detail: string, fieldIds: string[]): string | null {
  const match = /fields: (?:unknown field ')?([a-z0-9_]+)/.exec(detail);
  return match && fieldIds.includes(match[1]) ? match[1] : null;
}

/** A pasted social post link: http(s) with a host that has a dot. The service does the full canonicalisation. */
export function isPostLink(text: string): boolean {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return false;
  }
  return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
}
