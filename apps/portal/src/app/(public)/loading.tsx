import { getT } from "@/lib/i18n/server";

/** PRV-loading while a public page is being prepared (the reader can go back and try again). */
export default async function PublicLoading() {
  const { t } = await getT();
  return (
    <section className="card pub-state" role="status" aria-live="polite" aria-labelledby="public-loading">
      <h2 id="public-loading">{t("public.loading.title")}</h2>
      <p>{t("public.loading.body")}</p>
    </section>
  );
}
