import type { Lang } from "@/lib/i18n/core";
import { type LocalizedText, localizedText } from "@/lib/localized";

/** Producer text in the reader's language when the producer wrote it, else the plain field as it is (never translated). */
export function Localized({ lang, plain, i18n }: { lang: Lang; plain: string | null | undefined; i18n?: LocalizedText | null }) {
  const shown = localizedText(lang, plain, i18n);
  return shown.lang ? <span lang={shown.lang}>{shown.text}</span> : <>{shown.text}</>;
}
