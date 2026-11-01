import type { Translate } from "@/lib/i18n/core";

/** "Start a report": the Witness app, where reports start (anonymous, no account). Nothing when WITNESS_URL is unset. */
export function WitnessCta({ url, t }: { url: string | null | undefined; t: Translate }) {
  if (!url) return null;
  return (
    <p className="pub-witness">
      <a className="button" href={url}>
        {t("public.about.start")}
      </a>
      <span className="muted">{t("public.about.startHint")}</span>
    </p>
  );
}
