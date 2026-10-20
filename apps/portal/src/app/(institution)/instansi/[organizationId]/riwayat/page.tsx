import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { InstitutionConsole } from "@/components/console/Consoles";
import { DeliveryList } from "@/components/console/DeliveryList";
import { loadConfig } from "@/lib/config";
import { getT } from "@/lib/i18n/server";
import { listDeliveries } from "@/lib/institutions";
import { getOrganization } from "@/lib/organizations";
import { ROUTES, signInHref } from "@/lib/routes";
import { sessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("int.allTitle") };
}

type Params = Promise<{ organizationId: string }>;

/** "Lihat semua" of SCR-062: every delivery to a verified agency, newest first. */
export default async function DeliveriesPage({ params }: { params: Params }) {
  const id = decodeURIComponent((await params).organizationId);
  const path = ROUTES.organization(id);
  const token = await sessionToken();
  if (!token) redirect(signInHref(ROUTES.organizationHistory(id)));
  const { lang, t } = await getT();
  const config = loadConfig();
  const org = await getOrganization(config, token, id);
  if (!org.ok && org.status === 404) notFound();
  if (!org.ok || org.data.kind !== "agency" || org.data.status !== "verified") redirect(path);
  const deliveries = await listDeliveries(config, token, id);
  return (
    <InstitutionConsole organization={org.data} section="inbox">
      <nav aria-label={t("console.breadcrumb")} className="breadcrumb">
        <ol>
          <li>
            <Link href={path}>{t("console.institution.nav.integration")}</Link>
          </li>
          <li aria-current="page">{t("int.history")}</li>
        </ol>
      </nav>
      <div className="page-intro">
        <h1 id="deliveries-heading">{t("int.allTitle")}</h1>
        <p>{t("int.allIntro")}</p>
      </div>
      <section className="card int-card" aria-labelledby="deliveries-heading">
        {deliveries.ok ? (
          deliveries.data.length > 0 ? (
            <DeliveryList deliveries={deliveries.data} t={t} lang={lang} />
          ) : (
            <p className="muted" data-testid="deliveries-empty">
              {t("int.historyEmpty")}
            </p>
          )
        ) : (
          <p className="callout callout--error callout--inline">{t("int.historyError", { error: deliveries.error })}</p>
        )}
      </section>
    </InstitutionConsole>
  );
}
