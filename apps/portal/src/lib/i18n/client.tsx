"use client";

/** Language for client components: the server passes the request language to <I18nProvider> in the root layout. */

import { createContext, type ReactNode, useContext, useMemo } from "react";
import { DEFAULT_LANG, type Lang, type Translate, translator } from "./core";

const LangContext = createContext<Lang>(DEFAULT_LANG);

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang(): Lang {
  return useContext(LangContext);
}

export function useT(): Translate {
  const lang = useLang();
  return useMemo(() => translator(lang), [lang]);
}
