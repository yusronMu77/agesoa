/**
 * Language and region choice of SCR-009. Kept on the device only (language code and region name, never a
 * position). The prototype stores the choice; the interface text is Indonesian until a locale ships, and a language
 * without translations says so instead of claiming the app is translated.
 */

import type { KeyValueStore } from "./auth";
import { defaultStore } from "./auth";

const PREFS_KEY = "agesoa.witness.preferences";

export type Coverage = "full-preview" | "public-dashboard" | "planned";

export interface Language {
  code: string;
  name: string;
  coverage: Coverage;
}

/** Catalog of agesoa-uiux `copy/locales/catalog.json`: local names, translation coverage. */
export const LANGUAGES: Language[] = [
  { code: "id", name: "Bahasa Indonesia", coverage: "full-preview" },
  { code: "en", name: "English", coverage: "public-dashboard" },
  { code: "su", name: "Basa Sunda", coverage: "planned" },
  { code: "ms", name: "Bahasa Melayu", coverage: "planned" },
  { code: "jv", name: "Basa Jawa", coverage: "planned" },
  { code: "ban", name: "Bahasa Bali", coverage: "planned" },
  { code: "min", name: "Bahasa Minangkabau", coverage: "planned" },
  { code: "ace", name: "Bahasa Aceh", coverage: "planned" },
  { code: "bug", name: "Bahasa Bugis", coverage: "planned" },
  { code: "mad", name: "Bahasa Madura", coverage: "planned" },
  { code: "bbc", name: "Bahasa Batak Toba", coverage: "planned" },
];

/** Languages shown before the reporter searches the catalog. */
export const SHORTLIST = ["id", "en", "su", "ms"];

export interface Preferences {
  language: string;
  /** Regency code of the chosen region, or null while none is chosen. */
  region: string | null;
}

export function suggestedLanguage(deviceLanguage: string | undefined): string {
  const base = (deviceLanguage ?? "id").toLowerCase().split("-")[0] ?? "id";
  return LANGUAGES.some((language) => language.code === base) ? base : "id";
}

export function loadPreferences(store: KeyValueStore = defaultStore()): Preferences | null {
  try {
    const value = JSON.parse(store.getItem(PREFS_KEY) ?? "null") as Partial<Preferences> | null;
    if (!value || typeof value.language !== "string" || !LANGUAGES.some((l) => l.code === value.language)) return null;
    return { language: value.language, region: typeof value.region === "string" ? value.region : null };
  } catch {
    return null;
  }
}

export function savePreferences(preferences: Preferences, store: KeyValueStore = defaultStore()): void {
  store.setItem(PREFS_KEY, JSON.stringify(preferences));
}
