"use client";

import { useT } from "@/lib/i18n/client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  return (
    <section className="callout callout--error" aria-labelledby="error-heading">
      <h2 id="error-heading">{t("error.title")}</h2>
      <p>{t("error.body")}</p>
      <button type="button" className="button" onClick={() => reset()}>
        {t("error.retry")}
      </button>
    </section>
  );
}
