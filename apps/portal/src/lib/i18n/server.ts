/** Language of the current request (server components, route handlers). */

import { cookies, headers } from "next/headers";
import { isCatalogLanguage, LANG_COOKIE, type Lang, resolveLang, type Translate, translator } from "./core";

export async function getLang(): Promise<Lang> {
  const [jar, head] = await Promise.all([cookies(), headers()]);
  return resolveLang(jar.get(LANG_COOKIE)?.value, head.get("accept-language"));
}

export async function getT(): Promise<{ lang: Lang; t: Translate }> {
  const lang = await getLang();
  return { lang, t: translator(lang) };
}

/** The reader's saved language choice when it is a catalogue language (also one without portal texts yet), else null. */
export async function getLangPreference(): Promise<string | null> {
  const value = (await cookies()).get(LANG_COOKIE)?.value;
  return isCatalogLanguage(value) ? value : null;
}
