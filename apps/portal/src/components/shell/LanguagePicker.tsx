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
      <summary aria-label={t("common.language.current", { lang: t(`common.language.${lang}`) })}>
        <Globe aria-hidden size={18} strokeWidth={2} />
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
