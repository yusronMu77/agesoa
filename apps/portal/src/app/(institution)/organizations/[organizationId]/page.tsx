import { Building2, CircleCheck, Globe, Info, MapPin, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CopyButton } from "@/components/console/CopyButton";
import { KpiTiles } from "@/components/console/KpiTiles";
import { PendingButton } from "@/components/console/PendingButton";
import { StepGuide } from "@/components/console/StepGuide";
import { ApiKeyForm, TestEventForm, WebhookForm } from "@/components/InstitutionForms";
import { loadConfig } from "@/lib/config";
import { organizationSteps } from "@/lib/console-view";
import { formatDateTime, type Lang, type Translate } from "@/lib/i18n/core";
import { getT } from "@/lib/i18n/server";
import { attemptsSummary, type Delivery, getInstitution, listDeliveries } from "@/lib/institutions";
import { checkDns, type DnsResult, getOrganization } from "@/lib/organizations";
import { sessionToken } from "@/lib/session";
import { decideStaff, listStaff } from "@/lib/trust";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("orgPage.meta") };
}

type Params = Promise<{ organizationId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const DNS_RESULTS: DnsResult[] = ["verified", "already_verified", "no_record", "token_mismatch", "dns_error"];

async function decideCandidate(formData: FormData) {
  "use server";
  const id = String(formData.get("organization_id"));
  const token = await sessionToken();
  if (!token) redirect(`/login?next=/organizations/${encodeURIComponent(id)}`);
  const decision = formData.get("decision") === "confirm" ? "confirm" : "reject";
  await decideStaff(loadConfig(), token, id, String(formData.get("validator_id")), decision);
  redirect(`/organizations/${encodeURIComponent(id)}?staff=${decision}`);
}

async function runCheck(formData: FormData) {
  "use server";
  const id = String(formData.get("organization_id"));
  const token = await sessionToken();
  if (!token) redirect(`/login?next=/organizations/${encodeURIComponent(id)}`);
  const result = await checkDns(loadConfig(), token, id);
  redirect(`/organizations/${encodeURIComponent(id)}?check=${result.ok ? result.data.result : "dns_error"}`);
}

/** SCR-064/065 (domain verification and status), SCR-061 (newsroom: staff confirmation), SCR-062 (agency: integration). */
export default async function OrganizationPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const id = decodeURIComponent((await params).organizationId);
  const token = await sessionToken();
  if (!token) redirect(`/login?next=/organizations/${encodeURIComponent(id)}`);
  const { lang, t } = await getT();
  const org = await getOrganization(loadConfig(), token, id);
  if (!org.ok && org.status === 404) notFound();
  if (!org.ok) return <p className="callout callout--error">{t("orgPage.unavailable", { error: org.error })}</p>;
  const o = org.data;
  const { check, staff: staffDone } = await searchParams;
  const staff = o.status === "verified" && o.kind === "newsroom" ? await listStaff(loadConfig(), token, o.organization_id) : null;
  // SCR-062: only the admin of a verified agency gets the dashboard (delivery answers 404 otherwise).
  const [institution, deliveries] =
    o.status === "verified" && o.kind === "agency"
      ? await Promise.all([
          getInstitution(loadConfig(), token, o.organization_id),
          listDeliveries(loadConfig(), token, o.organization_id),
        ])
      : [null, null];
  const dnsResult = typeof check === "string" && (DNS_RESULTS as string[]).includes(check) ? (check as DnsResult) : null;
  const dnsOk = dnsResult === "verified" || dnsResult === "already_verified";
  const statusTone = o.status === "verified" ? "badge--ok" : o.status === "rejected" ? "badge--error" : "badge--warn";

  return (
    <>
      <Link href="/organizations" className="back-link">
        {t("orgPage.back")}
      </Link>
      <div className="org-title">
        <h1>{o.name}</h1>
        <span className={`badge ${statusTone}`} data-testid="organization-status">
          {t(`orgStatus.${o.status}`)}
        </span>
      </div>
      <p className="org-meta">
        <span>
          <Building2 aria-hidden size={16} strokeWidth={2} />
          {t(`orgKind.${o.kind}`)}
        </span>
        <span>
          <Globe aria-hidden size={16} strokeWidth={2} />
          <code>{o.domain}</code>
        </span>
        <span>
          <MapPin aria-hidden size={16} strokeWidth={2} />
          {o.region?.regency_name ?? "—"}
        </span>
        {o.verified_at ? <span>{t("orgPage.verifiedAt", { at: formatDateTime(lang, o.verified_at) })}</span> : null}
        {o.synthetic ? <span>{t("orgPage.fictional")}</span> : null}
      </p>

      {dnsResult ? (
        <div
          className={`callout ${dnsOk ? "callout--success" : dnsResult === "dns_error" ? "callout--error" : "callout--warning"}`}
          role="status"
          data-testid="dns-result"
        >
          <p className="callout__title">
            {dnsOk ? <CircleCheck aria-hidden size={18} strokeWidth={2} /> : <TriangleAlert aria-hidden size={18} strokeWidth={2} />}
            {t(`dns.resultTitle.${dnsResult}`)}
          </p>
          <p>{t(`dns.result.${dnsResult}`)}</p>
        </div>
      ) : null}

      {o.status === "verified" && o.kind === "newsroom" ? (
        <section aria-labelledby="staff-heading" data-testid="staff-queue">
          <div className="page-intro">
            <h2 id="staff-heading">{t("staff.title")}</h2>
            <p>{t("staff.intro")}</p>
          </div>
          {staff?.ok ? (
            <KpiTiles
              label={t("staff.title")}
              items={[{ label: t("staff.kpi.waiting"), value: staff.data.length, sub: t("staff.kpi.waitingSub") }]}
            />
          ) : null}
          <div className="callout">
            <p className="callout__title">
              <Info aria-hidden size={18} strokeWidth={2} />
              {t("staff.privacyTitle")}
            </p>
            <p>{t("staff.privacy")}</p>
          </div>
          {typeof staffDone === "string" ? (
            <p className="callout callout--success" role="status" data-testid="staff-result">
              {staffDone === "confirm" ? t("staff.confirmed") : t("staff.refused")}
            </p>
          ) : null}
          <div className="card">
            {staff && staff.ok && staff.data.length > 0 ? (
              <ul className="row-list">
                {staff.data.map((c) => (
                  <li key={c.validator_id} data-testid="staff-candidate">
                    <div className="row-list__body">
                      <p>
                        <strong>{c.name ?? t("staff.nameUnread")}</strong> · {c.role_label}
                      </p>
                      <p>{c.position ?? t("staff.positionUnread")}</p>
                      <p className="row-list__meta">
                        {t("staff.read", {
                          doc: c.document_type ?? t("staff.document"),
                          pct: c.confidence !== null ? `${Math.round(c.confidence * 100)}%` : "—",
                          at: formatDateTime(lang, c.requested_at),
                        })}
                      </p>
                    </div>
                    <form action={decideCandidate} className="inline-form">
                      <input type="hidden" name="organization_id" value={o.organization_id} />
                      <input type="hidden" name="validator_id" value={c.validator_id} />
                      <button type="submit" name="decision" value="confirm" className="button">
                        {t("staff.confirm")}
                      </button>
                      <button type="submit" name="decision" value="reject" className="button button--secondary">
                        {t("staff.reject")}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : staff && !staff.ok ? (
              <p className="callout callout--error callout--inline">{t("staff.listError", { error: staff.error })}</p>
            ) : (
              <p className="muted" data-testid="staff-empty">
                {t("staff.empty")}
              </p>
            )}
          </div>
        </section>
      ) : institution?.ok ? (
        <section aria-labelledby="integration-heading" data-testid="institution-integration">
          <div className="page-intro">
            <h2 id="integration-heading">{t("int.title")}</h2>
            <p>{t("int.intro")}</p>
          </div>
          <div className="integration-grid">
            <div className="stack">
              <section className="card" aria-labelledby="webhook-heading">
                <div className="section-title">
                  <h3 id="webhook-heading">{t("int.webhook")}</h3>
                  {institution.data.subscription ? <span className="badge badge--ok">{t("int.webhookActive")}</span> : null}
                </div>
                {institution.data.subscription ? (
                  <div className="secret-box" data-testid="webhook-subscription">
                    <p className="secret-box__label">{t("int.webhookCurrent")}</p>
                    <p>
                      <code>{institution.data.subscription.webhook_url}</code>
                    </p>
                    <p className="secret-box__label">
                      {t("int.region", { region: institution.data.subscription.region_code ?? t("int.all") })} ·{" "}
                      {t("int.category", { category: institution.data.subscription.category ?? t("int.all") })} ·{" "}
                      {t("int.since", { at: formatDateTime(lang, institution.data.subscription.created_at) })}
                    </p>
                  </div>
                ) : (
                  <p className="muted" data-testid="webhook-subscription">
                    {t("int.webhookNone")}
                  </p>
                )}
                <WebhookForm organizationId={o.organization_id} subscription={institution.data.subscription} />
                <TestEventForm organizationId={o.organization_id} />
              </section>

              <section className="card" aria-labelledby="apikey-heading">
                <div className="section-title">
                  <h3 id="apikey-heading">{t("int.apiKey")}</h3>
                </div>
                {institution.data.api_key ? (
                  <div className="secret-box">
                    <p className="secret-box__label">{t("int.apiKeyCurrent")}</p>
                    <p>
                      <code data-testid="api-key-prefix">{institution.data.api_key.prefix}</code>…
                    </p>
                    <p className="secret-box__label">
                      {t("int.apiKeyCreated", { at: formatDateTime(lang, institution.data.api_key.created_at) })}
                    </p>
                  </div>
                ) : (
                  <p className="muted">{t("int.apiKeyNone")}</p>
                )}
                <ApiKeyForm organizationId={o.organization_id} hasKey={institution.data.api_key !== null} />
              </section>
            </div>

            <section className="card" aria-labelledby="deliveries-heading">
              <div className="section-title">
                <h3 id="deliveries-heading">{t("int.history")}</h3>
                <a
                  href={`/organizations/${encodeURIComponent(o.organization_id)}`}
                  className="button button--secondary button--small"
                  data-testid="refresh-deliveries"
                >
                  {t("int.refresh")}
                </a>
              </div>
              {deliveries?.ok ? (
                deliveries.data.length > 0 ? (
                  <DeliveryList deliveries={deliveries.data} t={t} lang={lang} />
                ) : (
                  <p className="muted" data-testid="deliveries-empty">
                    {t("int.historyEmpty")}
                  </p>
                )
              ) : (
                <p className="callout callout--error callout--inline">{t("int.historyError", { error: deliveries?.error ?? "—" })}</p>
              )}
            </section>
          </div>
        </section>
      ) : o.status === "verified" ? (
        <section aria-labelledby="next-heading" className="card">
          <h2 id="next-heading">{t("orgStatus.verified")}</h2>
          <p>{t("dns.verifiedAgency")}</p>
        </section>
      ) : o.status === "rejected" ? (
        <div className="callout callout--error" data-testid="organization-rejected">
          <p className="callout__title">
            <TriangleAlert aria-hidden size={18} strokeWidth={2} />
            {t("dns.rejectedTitle")}
          </p>
          <p>{t("dns.rejected")}</p>
        </div>
      ) : (
        <div className="steps-layout">
          <StepGuide
            title={t("org.guide.title")}
            intro={t("org.guide.intro")}
            steps={["org.step1", "org.step2", "org.step3"].map((key, index) => ({
              label: t(key as "org.step1"),
              state: organizationSteps(o.status)[index],
            }))}
            stateText={{ done: t("step.done"), current: t("step.current"), next: t("step.next") }}
            progress={`${t("step.progress", { n: 2, total: 3 })}: ${t("org.step2")}`}
            foot={{ title: t("org.guide.footTitle"), body: t("org.guide.foot") }}
            ariaLabel={t("org.how")}
          />
          <section aria-labelledby="txt-heading" className="card steps-main">
            <div>
              <h2 id="txt-heading">{t("dns.title", { domain: o.domain })}</h2>
              <p className="muted">{t("dns.intro")}</p>
            </div>
            <div className="dns-record">
              <dl>
                <dt>{t("dns.type")}</dt>
                <dd>TXT</dd>
                <dt>{t("dns.host")}</dt>
                <dd>{t("dns.hostRoot")}</dd>
                <dt>{t("dns.value")}</dt>
                <dd>
                  <pre className="txt-record" data-testid="txt-record">
                    {o.txt_record}
                  </pre>
                </dd>
              </dl>
              <CopyButton value={o.txt_record} />
            </div>
            <div className="callout callout--inline">
              <p className="callout__title">
                <Info aria-hidden size={18} strokeWidth={2} />
                {t("dns.noAccessTitle")}
              </p>
              <p>{t("dns.noAccess")}</p>
            </div>
            <p className="field-hint field-hint--top">
              {t("dns.propagation")}
            </p>
            <form action={runCheck} className="actions actions--end">
              <input type="hidden" name="organization_id" value={o.organization_id} />
              <PendingButton pendingLabel={t("dns.checking")} testId="dns-check">
                {dnsResult ? t("dns.recheck") : t("dns.check")}
              </PendingButton>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

function DeliveryList({ deliveries, t, lang }: { deliveries: Delivery[]; t: Translate; lang: Lang }) {
  const failed = deliveries.filter((d) => d.status === "failed").length;
  return (
    <>
      <ul className="row-list" data-testid="delivery-history" aria-labelledby="deliveries-heading">
        {deliveries.map((d) => (
          <li key={d.delivery_id} data-testid="delivery-row" data-status={d.status} data-delivery-id={d.delivery_id}>
            <div className="row-list__body">
              <p>
                {t(`deliveryEvent.${d.event}`)} ·{" "}
                {d.event === "test_event" ? (
                  <code>{d.case_id}</code>
                ) : (
                  <Link href={`/cases/${encodeURIComponent(d.case_id)}`}>{d.case_id}</Link>
                )}
              </p>
              <p className="row-list__meta">
                <time dateTime={d.created_at}>{formatDateTime(lang, d.created_at)}</time> ·{" "}
                {t("int.attempts", { attempts: attemptsSummary(d.attempts) })}
                {d.internal_ticket ? ` · ${t("int.ticket", { ticket: d.internal_ticket })}` : ""}
              </p>
            </div>
            <span className={`badge ${d.status === "delivered" ? "badge--ok" : d.status === "failed" ? "badge--error" : "badge--warn"}`}>
              {t(`delivery.${d.status}`)}
            </span>
          </li>
        ))}
      </ul>
      {failed > 0 ? (
        <div className="callout callout--warning callout--after">
          <p className="callout__title">
            <TriangleAlert aria-hidden size={18} strokeWidth={2} />
            {t("int.failedTitle", { n: failed })}
          </p>
          <p>{t("int.failedBody")}</p>
        </div>
      ) : null}
    </>
  );
}
