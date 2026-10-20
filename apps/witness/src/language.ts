/**
 * The reporter's language and region preferences (SCR-009), remembered on this device only. Indonesian is the
 * default whatever the browser locale says; the device language is only used to mark a language as "suggested".
 *
 * The catalogue follows agesoa-uiux copy/locales/catalog.json: any listed language can be chosen, but only the
 * languages this app has texts for change the UI; a planned language is kept as a preference and the UI stays in
 * Indonesian (the base language) until its translation exists.
 */

import type { KeyValueStore } from "./auth";
import { defaultStore } from "./auth";
import type { Language } from "./copy";
import { isLanguage } from "./copy";

export const LANGUAGE_KEY = "agesoa.witness.language";
export const REGION_KEY = "agesoa.witness.region";
export const DEFAULT_LANGUAGE: Language = "id";

export interface CatalogLanguage {
  /** BCP 47 code. */
  code: string;
  /** The name in the language itself. */
  name: string;
  /** Indonesian name, for search. */
  nameId: string;
}

export const LANGUAGE_CATALOG: readonly CatalogLanguage[] = [
  { code: "id", name: "Bahasa Indonesia", nameId: "Bahasa Indonesia" },
  { code: "en", name: "English", nameId: "Bahasa Inggris" },
  { code: "su", name: "Basa Sunda", nameId: "Bahasa Sunda" },
  { code: "jv", name: "Basa Jawa", nameId: "Bahasa Jawa" },
  { code: "ms", name: "Bahasa Melayu", nameId: "Bahasa Melayu" },
  { code: "ban", name: "Bahasa Bali", nameId: "Bahasa Bali" },
  { code: "min", name: "Bahasa Minangkabau", nameId: "Bahasa Minangkabau" },
  { code: "ace", name: "Bahasa Aceh", nameId: "Bahasa Aceh" },
  { code: "bug", name: "Bahasa Bugis", nameId: "Bahasa Bugis" },
  { code: "mad", name: "Bahasa Madura", nameId: "Bahasa Madura" },
  { code: "bbc", name: "Bahasa Batak Toba", nameId: "Bahasa Batak Toba" },
];

/** Catalogue entries matching a search by name (own or Indonesian) or code; all of them for an empty search. */
export function searchLanguages(query: string, catalog: readonly CatalogLanguage[] = LANGUAGE_CATALOG): CatalogLanguage[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return [...catalog];
  return catalog.filter(
    (l) => l.code.toLowerCase().startsWith(q) || l.name.toLocaleLowerCase().includes(q) || l.nameId.toLocaleLowerCase().includes(q),
  );
}

function isCatalogCode(value: unknown): value is string {
  return typeof value === "string" && LANGUAGE_CATALOG.some((l) => l.code === value);
}

/** The language the UI is shown in: the saved preference when this app has its texts, else Indonesian. */
export function savedLanguage(store: KeyValueStore = defaultStore()): Language {
  return uiLanguage(store.getItem(LANGUAGE_KEY));
}

/** The saved preference (any catalogue code), Indonesian by default. */
export function savedPreference(store: KeyValueStore = defaultStore()): string {
  const value = store.getItem(LANGUAGE_KEY);
  return isCatalogCode(value) ? value : DEFAULT_LANGUAGE;
}

export function uiLanguage(code: string | null): Language {
  return isLanguage(code) ? code : DEFAULT_LANGUAGE;
}

export function saveLanguage(code: string, store: KeyValueStore = defaultStore()): void {
  if (isCatalogCode(code)) store.setItem(LANGUAGE_KEY, code);
}

/** The region name the reporter chose (never coordinates), or null. */
export function savedRegion(store: KeyValueStore = defaultStore()): string | null {
  const value = store.getItem(REGION_KEY);
  return value && value.length <= 120 ? value : null;
}

export function saveRegion(name: string | null, store: KeyValueStore = defaultStore()): void {
  store.setItem(REGION_KEY, name ? name.slice(0, 120) : "");
}

/** The first supported language among the device languages (e.g. navigator.languages), else Indonesian. */
export function suggestedLanguage(deviceLanguages: readonly string[]): Language {
  for (const tag of deviceLanguages) {
    const base = tag.toLowerCase().split("-")[0];
    if (isLanguage(base)) return base;
  }
  return DEFAULT_LANGUAGE;
}
