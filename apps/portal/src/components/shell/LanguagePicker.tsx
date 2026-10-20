"use client";

import { ChevronDown, Globe } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { LANGS } from "@/lib/i18n/core";
import { useLang, useT } from "@/lib/i18n/client";

/** Language picker (ID / EN) for every header. Each option is a link to /lang, so it works without JavaScript. */
export function LanguagePicker({ tone = "light" }: { tone?: "light" | "ink" }) {
  const lang = useLang();
  const t = useT();
  const pathname = usePathname() ?? "/";
  const query = useSearchParams()?.toString();
  const back = query ? `${pathname}?${query}` : pathname;
  return (
    <details className={`lang-picker lang-picker--${tone}`} data-testid="language-picker">
      {/* The accessible name contains the visible code (WCAG 2.5.3): "Bahasa ID" / "Language EN". */}
      <summary title={t("common.language.current", { lang: t(`common.language.${lang}`) })}>
        <Globe aria-hidden size={18} strokeWidth={2} />
        <span className="sr-only">{t("common.language.picker")} </span>
        <span>{lang.toUpperCase()}</span>
        <ChevronDown aria-hidden size={16} strokeWidth={2} />
      </summary>
      <ul>
        {LANGS.map((code) => (
          <li key={code}>
            <a
              href={`/lang?to=${code}&back=${encodeURIComponent(back)}`}
              hrefLang={code}
              lang={code}
              aria-current={code === lang ? "true" : undefined}
            >
              {t(`common.language.${code}`)}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
