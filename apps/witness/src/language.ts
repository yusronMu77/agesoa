/**
 * The reporter's language choice (SCR-009), remembered on this device only. Indonesian is the default whatever the
 * browser locale says; the device language is only used to mark a language as "suggested".
 */

import type { KeyValueStore } from "./auth";
import { defaultStore } from "./auth";
import type { Language } from "./copy";
import { isLanguage } from "./copy";

export const LANGUAGE_KEY = "agesoa.witness.language";
export const DEFAULT_LANGUAGE: Language = "id";

export function savedLanguage(store: KeyValueStore = defaultStore()): Language {
  const value = store.getItem(LANGUAGE_KEY);
  return isLanguage(value) ? value : DEFAULT_LANGUAGE;
}

export function saveLanguage(lang: Language, store: KeyValueStore = defaultStore()): void {
  store.setItem(LANGUAGE_KEY, lang);
}

/** The first supported language among the device languages (e.g. navigator.languages), else Indonesian. */
export function suggestedLanguage(deviceLanguages: readonly string[]): Language {
  for (const tag of deviceLanguages) {
    const base = tag.toLowerCase().split("-")[0];
    if (isLanguage(base)) return base;
  }
  return DEFAULT_LANGUAGE;
}
