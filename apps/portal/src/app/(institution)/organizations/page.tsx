import { Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PendingButton } from "@/components/console/PendingButton";
import { StepGuide } from "@/components/console/StepGuide";
import { loadConfig } from "@/lib/config";
import { errorDetail } from "@/lib/http";
import { getT } from "@/lib/i18n/server";
import { listMyOrganizations, registerOrganization } from "@/lib/organizations";
import { sessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("org.meta") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function register(formData: FormData) {
  "use server";
  const token = await sessionToken();
  if (!token) redirect("/login?next=/organizations");
  const { t } = await getT();
  const result = await registerOrganization(loadConfig(), token, {
    name: String(formData.get("name") ?? ""),
    kind: formData.get("kind") === "agency" ? "agency" : "newsroom",
    domain: String(formData.get("domain") ?? ""),
    region: { regency_name: String(formData.get("regency") ?? "") },
  });
  if (!result.ok) {
    const message =
      result.status === 409 ? t("org.error.conflict") : result.status === 422 ? t("org.error.invalid") : errorDetail(result);
    redirect(`/organizations?error=${encodeURIComponent(message)}`);
  }
  redirect(`/organizations/${encodeURIComponent(result.data.organization_id)}`);
}

/** SCR-060: the admin's organizations and the registration form (step 1 of the domain verification). */
export default async function OrganizationsPage({ searchParams }: { searchParams: SearchParams }) {
  const token = await sessionToken();
  if (!token) redirect("/login?next=/organizations");
  const config = loadConfig();
  const { t } = await getT();
  const mine = await listMyOrganizations(config, token);
  if (!mine.ok && (mine.status === 401 || mine.status === null)) redirect("/login?next=/organizations");
  const error = (await searchParams).error;

  return (
    <>
      <div className="page-intro">
        <h1>{t("org.title")}</h1>
        <p>{t("org.intro")}</p>
      </div>
      {mine.ok ? null : (
        <p className="callout callout--error" data-testid="not-org-admin">
          {t("org.notAdmin", { error: mine.error })}
        </p>
      )}

      <section aria-labelledby="mine-heading" className="ops-section">
        <h2 id="mine-heading">{t("org.mine")}</h2>
        {mine.ok && mine.data.length > 0 ? (
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
                {mine.data.map((o) => (
                  <tr key={o.organization_id}>
                    <td>
                      <Link href={`/organizations/${encodeURIComponent(o.organization_id)}`}>{o.name}</Link>
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
        ) : (
          <p className="callout" data-testid="organization-empty">
            {t("org.empty")}
          </p>
        )}
      </section>

      <section aria-labelledby="register-heading">
        <div className="page-intro">
          <h2 id="register-heading">{t("org.register")}</h2>
          <p>{t("org.registerIntro")}</p>
        </div>
        <div className="two-col two-col--wide-left">
          <div className="stack stack--tight">
            {typeof error === "string" ? (
              <p className="callout callout--error callout--inline" role="alert" data-testid="register-error">
                {error}
              </p>
            ) : null}
            <form action={register} className="card form" data-testid="register-form">
              <label>
                {t("org.name")}
                <input name="name" type="text" required minLength={2} maxLength={200} autoComplete="organization" />
              </label>
              <fieldset>
                <legend>{t("org.kind")}</legend>
                <label>
                  <input type="radio" name="kind" value="newsroom" defaultChecked /> {t("org.kind.newsroom")}
                  <span className="muted small">— {t("org.kind.newsroomHint")}</span>
                </label>
                <label>
                  <input type="radio" name="kind" value="agency" /> {t("org.kind.agency")}
                  <span className="muted small">— {t("org.kind.agencyHint")}</span>
                </label>
              </fieldset>
              <label>
                {t("org.domain")}
                <input
                  name="domain"
                  type="text"
                  required
                  placeholder="newsroom.example.org"
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="domain-hint"
                />
              </label>
              <p className="field-hint" id="domain-hint">
                {t("org.domainHint")}
              </p>
              <label>
                {t("org.regency")}
                <input name="regency" type="text" required maxLength={120} />
              </label>
              <div className="callout callout--inline">
                <p className="callout__title">
                  <Info aria-hidden size={18} strokeWidth={2} />
                  {t("org.stored")}
                </p>
                <p>{t("org.storedBody")}</p>
              </div>
              <div className="actions actions--end">
                <PendingButton pendingLabel={t("login.wait")}>{t("org.submit")}</PendingButton>
              </div>
            </form>
          </div>
          <StepGuide
            tone="light"
            title={t("org.how")}
            intro={t("org.guide.intro")}
            steps={[
              { label: t("org.step1"), state: "current", hint: t("org.step1.hint") },
              { label: t("org.step2"), state: "next", hint: t("org.step2.hint") },
              { label: t("org.step3"), state: "next", hint: t("org.step3.hint") },
            ]}
            stateText={{ done: t("step.done"), current: t("step.current"), next: t("step.next") }}
            progress={`${t("step.progress", { n: 1, total: 3 })}: ${t("org.step1")}`}
            foot={{ title: t("org.guide.footTitle"), body: t("org.guide.foot") }}
            ariaLabel={t("org.how")}
          />
        </div>
      </section>
    </>
  );
}
