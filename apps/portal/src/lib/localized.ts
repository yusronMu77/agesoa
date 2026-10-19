/**
 * Producer-written text in several languages (contract `localized_text` on findings and audit reports). The plain
 * field stays the source of truth; the per-language companion is used when it has the reader's language. Never
 * translates. The portal UI is English today (`<html lang="en">`); per-reader languages come with issue #124.
 */

export type Lang = "id" | "en";
export type LocalizedText = Partial<Record<Lang, string>>;

/** Language of the portal UI until the language picker (#124) makes it per reader. */
export const UI_LANG: Lang = "en";

export function localizedText(
  plain: string | null | undefined,
  i18n?: LocalizedText | null,
  lang: Lang = UI_LANG,
): string {
  return i18n?.[lang] || plain || Object.values(i18n ?? {}).find(Boolean) || "";
}

/** Recommendations per language, used only when they line up one to one with the plain list. */
export function localizedList(
  plain: readonly string[],
  i18n?: readonly (LocalizedText | null)[] | null,
  lang: Lang = UI_LANG,
): string[] {
  const aligned = i18n && i18n.length === plain.length ? i18n : null;
  return plain.map((text, i) => localizedText(text, aligned?.[i], lang));
}
