import { Activity, Building2, LayoutDashboard, ScrollText, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EvidenceBadge } from "@/components/EvidenceBadge";
import { WitnessCta } from "@/components/public/WitnessCta";
import { loadConfig } from "@/lib/config";
import { getT } from "@/lib/i18n/server";
import { ROUTES } from "@/lib/routes";
import { EVIDENCE_STATUSES } from "@/lib/publicview";

// "Tentang" (About): why AGESOA exists (PRV-about wording), where to go next, and how findings are labelled.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("public.about.title") };
}

export default async function AboutPage() {
  const { lang, t } = await getT();
  const witnessUrl = loadConfig().witnessUrl ?? null;
  const explore = [
    { href: ROUTES.home, title: t("public.dashboard.title"), body: t("public.about.dashboard"), Icon: LayoutDashboard },
    { href: ROUTES.log, title: t("public.logPage.title"), body: t("public.about.log"), Icon: ScrollText },
    { href: ROUTES.status, title: t("public.about.status.title"), body: t("public.about.status"), Icon: Activity },
    { href: ROUTES.validator, title: t("public.nav.forValidators"), body: t("public.about.validators"), Icon: ShieldCheck },
    { href: ROUTES.institution, title: t("public.nav.forInstitutions"), body: t("public.about.institutions"), Icon: Building2 },
  ];
  return (
    <div className="pub-about">
      <p className="eyebrow">{t("public.about.title")}</p>
      <h1 className="pub-about__title">{t("public.about.lead")}</h1>
      <p className="lead">{t("public.about.intro1")}</p>
      {/* PRV-about primary: the Witness app, where reports start (anonymous, no account). */}
      <WitnessCta url={witnessUrl} t={t} />
      <p className="pub-about__body">{t("public.about.intro2")}</p>

      <ul className="card-grid" aria-label={t("public.about.explore")}>
        {explore.map(({ href, title, body, Icon }) => (
          <li key={href} className="card pub-about__card">
            <Icon aria-hidden size={20} strokeWidth={2} className="pub-about__icon" />
            <h2>
              <Link href={href}>{title}</Link>
            </h2>
            <p className="muted">{body}</p>
          </li>
        ))}
      </ul>

      <section aria-labelledby="evidence-heading" className="card">
        <h2 id="evidence-heading">{t("public.about.evidence.title")}</h2>
        <p className="muted">{t("public.about.evidence.intro")}</p>
        <dl className="evidence-legend">
          {EVIDENCE_STATUSES.map((s) => (
            <div key={s}>
              <dt>
                <EvidenceBadge status={s} lang={lang} />
              </dt>
              <dd>{t(`public.about.evidence.${s}`)}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
