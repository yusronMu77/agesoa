import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ConsoleContext } from "@/components/console/ConsoleContext";
import { InstitutionConsole } from "@/components/console/Consoles";
import { RegistrationShell } from "@/components/console/RegistrationShell";
import { OrganizationRegisterForm } from "@/components/InstitutionForms";
import { loadConfig } from "@/lib/config";
import { tokenEmail } from "@/lib/console-view";
import { getT } from "@/lib/i18n/server";
import { listMyOrganizations, type Organization } from "@/lib/organizations";
import { ROUTES, signInHref } from "@/lib/routes";
import { sessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("org.meta") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Kind = Organization["kind"];

const parseKind = (value: unknown): Kind | "" => (value === "newsroom" || value === "agency" ? value : "");
const REGISTER_HREF = `${ROUTES.institution}?daftar=1`;

/**
 * SCR-060. An admin without an organization (or asking for a new one, `?daftar=1`) gets the full-page registration
 * (agesoa-uiux registration "instansi-data": data → DNS → status); an admin with organizations gets the console
 * list of them ("Pendaftaran organisasi"), each opening its DNS step, status or dashboard.
 */
export default async function OrganizationsPage({ searchParams }: { searchParams: SearchParams }) {
  const token = await sessionToken();
  if (!token) redirect(signInHref(ROUTES.institution));
  const config = loadConfig();
  const { t } = await getT();
  const mine = await listMyOrganizations(config, token);
  if (!mine.ok && (mine.status === 401 || mine.status === null)) redirect(signInHref(ROUTES.institution));
  const query = await searchParams;
  const kind = parseKind(query.kind);
  const all = mine.ok ? mine.data : [];

  if (mine.ok && (all.length === 0 || query.daftar === "1")) {
    return (
      <RegistrationShell flow="organization" step={0} signInHref={signInHref(ROUTES.institution)}>
        <OrganizationRegisterForm
          adminEmail={tokenEmail(token)}
          backHref={all.length > 0 ? ROUTES.institution : "/"}
          initialKind={kind || "agency"}
        />
      </RegistrationShell>
    );
  }

  const list = all.filter((o) => !kind || o.kind === kind);
  // The sidebar and identity card follow the admin's organization (the first one) when there is one.
  const current = all[0] ?? null;
  const context = (
    <ConsoleContext
      action={ROUTES.institution}
      label={t("console.context.label")}
      applyLabel={t("console.context.apply")}
      hint={t("console.context.hint")}
      selects={[
        {
          name: "kind",
          label: t("console.context.orgKind"),
          value: kind,
          options: [
            { value: "", label: t("console.context.orgKind.all") },
            { value: "agency", label: t("org.kind.agency") },
            { value: "newsroom", label: t("org.kind.newsroom") },
          ],
        },
      ]}
    />
  );

  return (
    <InstitutionConsole organization={current} section="register" context={context}>
      <div className="page-intro page-intro--split">
        <div>
          <h1 id="mine-heading">{t("org.mine")}</h1>
          <p>{t("org.mineIntro")}</p>
        </div>
        {mine.ok ? (
          <Link href={REGISTER_HREF} className="button button--secondary" data-testid="register-new">
            <Plus aria-hidden size={18} strokeWidth={2} />
            {t("org.registerNew")}
          </Link>
        ) : null}
      </div>
      {mine.ok ? null : (
        <p className="callout callout--error" data-testid="not-org-admin">
          {t("org.notAdmin", { error: mine.error })}
        </p>
      )}
      {list.length > 0 ? (
        <div className="table-wrap" role="region" aria-labelledby="mine-heading" tabIndex={0}>
          <table data-testid="organization-list">
            <thead>
              <tr>
                <th scope="col">{t("org.col.name")}</th>
                <th scope="col">{t("org.col.type")}</th>
                <th scope="col">{t("org.col.domain")}</th>
                <th scope="col">{t("org.col.regency")}</th>
                <th scope="col">{t("org.col.status")}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((o) => (
                <tr key={o.organization_id}>
                  <td>
                    <Link href={ROUTES.organization(o.organization_id)}>{o.name}</Link>
                  </td>
                  <td>{t(`orgKind.${o.kind}`)}</td>
                  <td>
                    <code>{o.domain}</code>
                  </td>
                  <td>{o.region?.regency_name ?? "—"}</td>
                  <td>
                    <span
                      className={`badge ${o.status === "verified" ? "badge--ok" : o.status === "rejected" ? "badge--error" : "badge--warn"}`}
                    >
                      {t(`orgStatus.${o.status}`)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : mine.ok ? (
        <p className="callout" data-testid="organization-empty">
          {t("org.empty")}
        </p>
      ) : null}
    </InstitutionConsole>
  );
}
