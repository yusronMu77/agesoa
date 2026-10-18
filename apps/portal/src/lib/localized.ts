/**
 * Producer-written text in several languages (contract `localized_text`: findings, audit reports). The plain field
 * stays the source of truth; the per-language companion is used when it has the reader's language. Never translates.
 */

import type { Lang } from "./i18n/core";

export type LocalizedText = Partial<Record<Lang, string>>;

export interface Shown {
  text: string;
  /** Language of `text` when known (for the `lang` attribute); undefined for a plain field of unknown language. */
  lang?: Lang;
}

export function localizedText(lang: Lang, plain: string | null | undefined, i18n?: LocalizedText | null): Shown {
  const own = i18n?.[lang];
  if (own) return { text: own, lang };
  if (plain) return { text: plain };
  // No plain text: any language the producer wrote is better than nothing.
  for (const [other, text] of Object.entries(i18n ?? {})) if (text) return { text, lang: other as Lang };
  return { text: "" };
}

/** Recommendations per language, used only when they line up one to one with the plain list. */
export function localizedList(
  lang: Lang,
  plain: readonly string[],
  i18n?: readonly (LocalizedText | null)[] | null,
): Shown[] {
  const aligned = i18n && i18n.length === plain.length ? i18n : null;
  return plain.map((text, i) => localizedText(lang, text, aligned?.[i]));
}
