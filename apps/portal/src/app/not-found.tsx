import Link from "next/link";
import { PublicShell } from "@/components/shell/PublicShell";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const { t } = await getT();
  return (
    <PublicShell>
      <section className="empty-page">
        <h1>{t("notFound.title")}</h1>
        <p>{t("notFound.body")}</p>
        <p>
          <Link href="/log">{t("notFound.toLog")}</Link> {t("notFound.or")} <Link href="/">{t("notFound.toHome")}</Link>.
        </p>
      </section>
    </PublicShell>
  );
}
