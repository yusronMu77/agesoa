import { CircleCheck, CirclePause, Globe, Info, Tablet, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ConfirmSubmit } from "@/components/console/ConfirmSubmit";
import { ConsoleContext } from "@/components/console/ConsoleContext";
import { InstitutionConsole } from "@/components/console/Consoles";
import { CopyButton } from "@/components/console/CopyButton";
import { DeliveryList } from "@/components/console/DeliveryList";
import { KpiTiles } from "@/components/console/KpiTiles";
import { PendingButton } from "@/components/console/PendingButton";
import { RegistrationHead, RegistrationRow, RegistrationShell } from "@/components/console/RegistrationShell";
import { ApiKeyForm, TestEventForm, WebhookForm } from "@/components/InstitutionForms";
import { loadConfig } from "@/lib/config";
import { organizationView } from "@/lib/console-view";
import { formatDate, formatDateTime, type Lang, type Translate } from "@/lib/i18n/core";
import { getT } from "@/lib/i18n/server";
import { getInstitution, listDeliveries } from "@/lib/institutions";
import { DnsInstructions } from "@/components/console/DnsInstructions";
import { checkDns, type DnsResult, getOrganization, type Organization } from "@/lib/organizations";
import { ROUTES, signInHref } from "@/lib/routes";
import { sessionToken } from "@/lib/session";
import { decideStaff, listStaff, type StaffCandidate } from "@/lib/trust";
import { pauseWebhook, resumeWebhook } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("orgPage.meta") };
}

type Params = Promise<{ organizationId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const DNS_RESULTS: DnsResult[] = ["verified", "already_verified", "no_record", "token_mismatch", "dns_error"];
/** SCR-062 shows the newest deliveries only; the full history is one click away ("Lihat semua"). */
const LATEST_DELIVERIES = 4;

async function decideCandidate(formData: FormData) {
  "use server";
  const id = String(formData.get("organization_id"));
  const token = await sessionToken();
  if (!token) redirect(signInHref(ROUTES.organization(id)));
  const decision = formData.get("decision") === "confirm" ? "confirm" : "reject";
  await decideStaff(loadConfig(), token, id, String(formData.get("validator_id")), decision);
  redirect(`${ROUTES.organization(id)}?staff=${decision}`);
}

async function runCheck(formData: FormData) {
  "use server";
  const id = String(formData.get("organization_id"));
  const token = await sessionToken();
  if (!token) redirect(signInHref(ROUTES.organization(id)));
  const result = await checkDns(loadConfig(), token, id);
  redirect(`${ROUTES.organization(id)}?check=${result.ok ? result.data.result : "dns_error"}`);
}

/**
 * SCR-064/065 (domain verification and its status, full-page registration), SCR-061 (newsroom: staff
 * confirmation) and SCR-062 (agency: integration) in the console.
 */
export default async function OrganizationPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const id = decodeURIComponent((await params).organizationId);
  const token = await sessionToken();
  if (!token) redirect(signInHref(ROUTES.organization(id)));
  const { lang, t } = await getT();
  const config = loadConfig();
  const org = await getOrganization(config, token, id);
  if (!org.ok && org.status === 404) notFound();
  if (!org.ok) {
    return (
      <InstitutionConsole organization={null} section={null}>
        <p className="callout callout--error">{t("orgPage.unavailable", { error: org.error })}</p>
      </InstitutionConsole>
    );
  }
  const o = org.data;
  const { check, staff: staffDone, webhook: webhookResult, released } = await searchParams;
  const dnsResult = typeof check === "string" && (DNS_RESULTS as string[]).includes(check) ? (check as DnsResult) : null;
  const view = organizationView(o.status, dnsResult);

  if (view !== "dashboard") {
    return (
      <RegistrationShell flow="organization" step={view === "dns" ? 1 : 2} signInHref={signInHref(ROUTES.organization(id))}>
        {view === "dns" ? <DnsStep o={o} t={t} result={dnsResult} /> : <DnsStatus o={o} t={t} lang={lang} result={dnsResult} />}
      </RegistrationShell>
    );
  }

  const context = (
    <ConsoleContext
      action={ROUTES.organization(id)}
      label={t("console.context.label")}
      applyLabel={t("console.context.apply")}
      hint={t("console.context.hint")}
      selects={[
        {
          name: "domain",
          label: t("console.context.issueType"),
          value: "",
          options: [{ value: "", label: t("console.context.issueType.all") }],
        },
      ]}
    />
  );

  if (o.kind === "newsroom") {
    const staff = await listStaff(config, token, o.organization_id);
    return (
      <InstitutionConsole organization={o} section="staff" context={context}>
        <section aria-labelledby="staff-heading" data-testid="staff-queue">
          <div className="page-intro">
            <h1 id="staff-heading">{t("staff.title")}</h1>
            <p>{t("staff.intro")}</p>
          </div>
          {staff.ok ? (
            <KpiTiles
              label={t("staff.title")}
              items={[
                { label: t("staff.kpi.waiting"), value: staff.data.length, sub: t("staff.kpi.waitingSub") },
                {
                  label: t("staff.kpi.verified"),
                  value: o.verified_at ? formatDate(lang, o.verified_at) : "—",
                  sub: o.domain,
                },
              ]}
            />
          ) : null}
          <div className="callout callout--info-title">
            <p className="callout__title">
              <Info aria-hidden size={20} strokeWidth={2} />
              {t("staff.privacyTitle")}
            </p>
            <p>{t("staff.privacy")}</p>
          </div>
          {typeof staffDone === "string" ? (
            <div className="callout callout--success" role="status" data-testid="staff-result">
              <p className="callout__title">
                <CircleCheck aria-hidden size={20} strokeWidth={2} />
                {t("staff.doneTitle")}
              </p>
              <p>
                {staffDone === "confirm" ? t("staff.confirmed") : t("staff.refused")} {t("staff.doneBody")}{" "}
                <Link href={ROUTES.institutionLog}>{t("queue.doneLog")}</Link>
              </p>
            </div>
          ) : null}
          <StaffTable o={o} staff={staff.ok ? staff.data : null} error={staff.ok ? null : staff.error} t={t} lang={lang} />
        </section>
      </InstitutionConsole>
    );
  }

  const [institution, deliveries] = await Promise.all([
    getInstitution(config, token, o.organization_id),
    listDeliveries(config, token, o.organization_id),
  ]);
  if (!institution.ok) {
    return (
      <InstitutionConsole organization={o} section="integration" context={context}>
        <div className="page-intro">
          <h1>{t("int.title")}</h1>
          <p>{t("dns.verifiedAgency")}</p>
        </div>
      </InstitutionConsole>
    );
  }
  const sub = institution.data.subscription;
  const deliveriesHref = ROUTES.organizationHistory(o.organization_id);
  return (
    <InstitutionConsole organization={o} section="integration" context={context}>
      <section aria-labelledby="integration-heading" data-testid="institution-integration">
        <div className="page-intro">
          <h1 id="integration-heading">{t("int.title")}</h1>
          <p>{t("int.intro")}</p>
        </div>
        <div className="integration-grid">
          <div className="stack">
            <section className="card int-card" aria-labelledby="webhook-heading">
              <div className="section-title">
                <h2 id="webhook-heading">{t("int.webhook")}</h2>
                {sub ? (
                  <span className={`badge ${sub.paused ? "badge--warn" : "badge--ok"}`} data-testid="webhook-state">
                    {sub.paused ? t("int.paused") : t("int.webhookActive")}
                  </span>
                ) : null}
              </div>
              <div data-testid="webhook-subscription" className="sr-only">
                {sub
                  ? `${t("int.webhookCurrent")}: ${sub.webhook_url} · ${t("int.since", { at: formatDateTime(lang, sub.created_at) })}`
                  : t("int.webhookNone")}
              </div>
              <WebhookForm organizationId={o.organization_id} subscription={sub} formId="webhook-form" />
              {webhookResult === "paused" && sub?.paused ? (
                <p className="callout callout--success callout--inline" role="status" data-testid="webhook-result">
                  {t("int.pauseDone")}
                </p>
              ) : webhookResult === "resumed" && sub && !sub.paused ? (
                <p className="callout callout--success callout--inline" role="status" data-testid="webhook-result">
                  {t("int.resumed", { n: Number(typeof released === "string" ? released : 0) || 0 })}
                </p>
              ) : webhookResult === "none" ? (
                <p className="callout callout--error callout--inline" role="alert" data-testid="webhook-result">
                  {t("int.error.saveFirst")}
                </p>
              ) : webhookResult === "error" ? (
                <p className="callout callout--error callout--inline" role="alert" data-testid="webhook-result">
                  {t("int.pauseError")}
                </p>
              ) : null}
              {sub?.paused ? (
                <div className="callout callout--warning callout--inline int-paused" data-testid="webhook-paused">
                  <p className="callout__title">
                    <CirclePause aria-hidden size={20} strokeWidth={2} />
                    {t("int.pausedTitle")}
                  </p>
                  <p>{t("int.pausedBody", { at: formatDateTime(lang, sub.paused_at ?? null) })}</p>
                  <p>{t("int.pausedHeld", { n: sub.held_deliveries ?? 0 })}</p>
                  <form action={resumeWebhook}>
                    <input type="hidden" name="organization_id" value={o.organization_id} />
                    <PendingButton pendingLabel={t("login.wait")} testId="resume-webhook" className="button">
                      {t("int.resume")}
                    </PendingButton>
                  </form>
                </div>
              ) : null}
              <div className="int-actions">
                <TestEventForm organizationId={o.organization_id} />
                {sub && !sub.paused ? (
                  <form action={pauseWebhook} className="inline-form">
                    <input type="hidden" name="organization_id" value={o.organization_id} />
                    <ConfirmSubmit
                      className="button button--secondary"
                      testId="pause-webhook"
                      confirmTestId="pause-webhook-confirm"
                      title={t("int.pauseDialog.title")}
                      body={t("int.pauseDialog.body")}
                      confirmLabel={t("int.pause")}
                      cancelLabel={t("decide.confirm.cancel")}
                      pendingLabel={t("login.wait")}
                    >
                      {t("int.pause")}
                    </ConfirmSubmit>
                  </form>
                ) : null}
                <button type="submit" form="webhook-form" className="button button--secondary">
                  {t("int.saveWebhook")}
                </button>
              </div>
            </section>

            <section className="card int-card" aria-labelledby="apikey-heading">
              <ApiKeyForm organizationId={o.organization_id} hasKey={institution.data.api_key !== null}>
                {institution.data.api_key ? (
                  <ul className="key-list">
                    <li className="key-row">
                      <span className="key-row__text">
                        <code data-testid="api-key-prefix">{institution.data.api_key.prefix}…</code>
                        <span>{t("int.apiKeyCreated", { at: formatDateTime(lang, institution.data.api_key.created_at) })}</span>
                      </span>
                      <span className="badge badge--ok">{t("int.webhookActive")}</span>
                    </li>
                  </ul>
                ) : (
                  <p className="muted">{t("int.apiKeyNone")}</p>
                )}
              </ApiKeyForm>
            </section>
          </div>

          <section className="card int-card" aria-labelledby="deliveries-heading">
            <div className="section-title">
              <h2 id="deliveries-heading">{t("int.history")}</h2>
              <Link href={deliveriesHref} className="see-all" data-testid="refresh-deliveries">
                {t("int.seeAll")}
              </Link>
            </div>
            {deliveries.ok ? (
              deliveries.data.length > 0 ? (
                <DeliveryList deliveries={deliveries.data} limit={LATEST_DELIVERIES} t={t} lang={lang} />
              ) : (
                <p className="muted" data-testid="deliveries-empty">
                  {t("int.historyEmpty")}
                </p>
              )
            ) : (
              <p className="callout callout--error callout--inline">{t("int.historyError", { error: deliveries.error })}</p>
            )}
          </section>
        </div>
      </section>
    </InstitutionConsole>
  );
}

function StaffTable({
  o,
  staff,
  error,
  t,
  lang,
}: {
  o: Organization;
  staff: StaffCandidate[] | null;
  error: string | null;
  t: Translate;
  lang: Lang;
}) {
  if (error !== null) return <p className="callout callout--error callout--inline">{t("staff.listError", { error })}</p>;
  if (!staff || staff.length === 0) {
    return (
      <p className="callout" data-testid="staff-empty">
        {t("staff.empty")}
      </p>
    );
  }
  return (
    <div className="table-wrap staff-wrap" role="region" aria-labelledby="staff-caption" tabIndex={0}>
      <table className="staff-table">
        <caption id="staff-caption" className="sr-only">
          {t("staff.caption")}
        </caption>
        <thead>
          <tr>
            <th scope="col">{t("staff.col.person")}</th>
            <th scope="col" className="staff-table__actions">
              {t("staff.col.action")}
            </th>
          </tr>
        </thead>
        <tbody>
          {staff.map((c) => (
            <tr key={c.validator_id} data-testid="staff-candidate">
              <td>
                <p className="staff-person">
                  <span className="staff-person__name">{c.name ?? t("staff.nameUnread")}</span>
                  <span className="badge badge--neutral">{c.role_label}</span>
                </p>
                <p className="staff-person__position">{c.position ?? t("staff.positionUnread")}</p>
                <p className="staff-person__meta">
                  {t("staff.read", {
                    doc: c.document_type ?? t("staff.document"),
                    pct: c.confidence !== null ? `${Math.round(c.confidence * 100)}%` : "—",
                    at: formatDateTime(lang, c.requested_at),
                  })}
                </p>
              </td>
              <td className="staff-table__actions">
                <form action={decideCandidate} className="inline-form">
                  <input type="hidden" name="organization_id" value={o.organization_id} />
                  <input type="hidden" name="validator_id" value={c.validator_id} />
                  <ConfirmSubmit
                    name="decision"
                    value="confirm"
                    className="button button--compact"
                    title={t("staff.confirmDialog.title")}
                    body={t("staff.confirmDialog.body")}
                    confirmLabel={t("staff.confirmDialog.yes")}
                    cancelLabel={t("decide.confirm.cancel")}
                    pendingLabel={t("login.wait")}
                  >
                    {t("staff.confirm")}
                  </ConfirmSubmit>
                  <ConfirmSubmit
                    name="decision"
                    value="reject"
                    className="button button--secondary button--compact"
                    title={t("staff.rejectDialog.title")}
                    body={t("staff.rejectDialog.body")}
                    confirmLabel={t("staff.reject")}
                    cancelLabel={t("decide.confirm.cancel")}
                    pendingLabel={t("login.wait")}
                  >
                    {t("staff.reject")}
                  </ConfirmSubmit>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** SCR-064: the TXT record to add; "Cek DNS" asks trust to look it up. Timeout/DNS error stays on this step. */
function DnsStep({ o, t, result }: { o: Organization; t: Translate; result: DnsResult | null }) {
  const failed = result === "dns_error";
  return (
    <section className="register-view" aria-labelledby="dns-heading">
      <div className="register-head">
        <h1 id="dns-heading">{failed ? t("dns.resultTitle.dns_error") : t("dns.stepTitle")}</h1>
        <p>{failed ? t("dns.result.dns_error") : t("dns.intro")}</p>
      </div>
      <p className="sr-only" data-testid="organization-status">
        {t(`orgStatus.${o.status}`)}
      </p>
      <div className="register-fields">
        <ul className="register-rows">
          <RegistrationRow icon={<Globe size={24} strokeWidth={1.75} />} title={t("dns.domainRow")} detail={o.domain} />
        </ul>
        <div className="register-record">
          <p className="register-record__type">{t("dns.typeLine")}</p>
          <p>{t("dns.hostLine")}</p>
          <pre className="register-record__value" data-testid="txt-record">
            {o.txt_record}
          </pre>
          <CopyButton value={o.txt_record} />
          <DnsInstructions domain={o.domain} value={o.txt_record} />
        </div>
        {failed ? (
          <div className="callout callout--warning callout--inline register-callout" role="status" data-testid="dns-result">
            <p className="callout__title">
              <TriangleAlert aria-hidden size={20} strokeWidth={2} />
              {t("dns.resultTitle.dns_error")}
            </p>
            <p>{t("dns.result.dns_error")}</p>
          </div>
        ) : (
          <div className="callout callout--inline register-callout">
            <p className="callout__title">
              <Info aria-hidden size={20} strokeWidth={2} />
              {t("dns.noAccessTitle")}
            </p>
            <p>{t("dns.noAccess")}</p>
          </div>
        )}
        <p className="register-hint">{t(o.synthetic ? "dns.propagationSim" : "dns.propagation")}</p>
        <form action={runCheck} className="register-actions">
          <input type="hidden" name="organization_id" value={o.organization_id} />
          <Link href={ROUTES.institution} className="button button--ghost">
            {t("reg.back")}
          </Link>
          <PendingButton pendingLabel={t("dns.checking")} testId="dns-check" className="button register-actions__primary">
            {t("dns.check")}
          </PendingButton>
        </form>
      </div>
    </section>
  );
}

/** SCR-065: the outcome of a DNS check (waiting, wrong value, verified) or a rejected organization. */
function DnsStatus({ o, t, lang, result }: { o: Organization; t: Translate; lang: Lang; result: DnsResult | null }) {
  const verified = o.status === "verified";
  const rejected = o.status === "rejected";
  const mismatch = result === "token_mismatch";
  const key = verified ? "verified" : rejected ? "rejected" : mismatch ? "mismatch" : "waiting";
  const tone = verified ? "success" : rejected ? "error" : "warning";
  const badgeTone = verified ? "badge--ok" : rejected ? "badge--error" : "badge--warn";
  const orgHref = ROUTES.organization(o.organization_id);
  return (
    <section className="register-view" aria-labelledby="dns-heading" data-testid={rejected ? "organization-rejected" : undefined}>
      <div className="register-head">
        <h1 id="dns-heading">{t(`dns.status.${key}.title`)}</h1>
        <p>{t(`dns.status.${key}.lead`)}</p>
      </div>
      <div className="register-fields">
        <p>
          <span className={`badge ${badgeTone} register-badge`} data-testid="organization-status">
            {t(`orgStatus.${o.status}`)}
          </span>
        </p>
        <div className={`callout callout--${tone} callout--inline register-callout`} role="status" data-testid={rejected ? undefined : "dns-result"}>
          <p className="callout__title">
            {verified ? <CircleCheck aria-hidden size={20} strokeWidth={2} /> : <TriangleAlert aria-hidden size={20} strokeWidth={2} />}
            {t(`dns.status.${key}.callout`)}
          </p>
          <p>{result ? t(`dns.result.${result}`) : t(`dns.status.${key}.body`)}</p>
        </div>
        <ul className="register-rows">
          <RegistrationRow
            icon={<Tablet size={24} strokeWidth={1.75} />}
            title={o.name}
            detail={[t(`orgKind.${o.kind}`), o.region?.regency_name].filter(Boolean).join(" · ")}
          />
          <RegistrationRow
            icon={<Globe size={24} strokeWidth={1.75} />}
            title={o.domain}
            detail={
              verified && o.verified_at
                ? t("dns.status.matched", { at: formatDateTime(lang, o.verified_at) })
                : t(o.synthetic ? "dns.status.submissionSim" : "dns.status.submission", { id: o.organization_id })
            }
          />
        </ul>
        <p className="register-hint">{t(verified ? "dns.status.nextHint" : "dns.status.keptHint")}</p>
        {verified ? (
          <div className="register-actions">
            <Link href={signInHref(orgHref)} className="button button--ghost">
              {t("reg.status.signIn")}
            </Link>
            <Link href={orgHref} className="button register-actions__primary">
              {t("dns.status.openDashboard")}
            </Link>
          </div>
        ) : rejected ? (
          <div className="register-actions">
            <Link href={ROUTES.institution} className="button button--ghost">
              {t("reg.back")}
            </Link>
            <Link href={ROUTES.institution} className="button register-actions__primary">
              {t("dns.status.fix")}
            </Link>
          </div>
        ) : (
          <form action={runCheck} className="register-actions">
            <input type="hidden" name="organization_id" value={o.organization_id} />
            <Link href={ROUTES.institution} className="button button--ghost">
              {t("dns.status.change")}
            </Link>
            <PendingButton pendingLabel={t("dns.checking")} testId="dns-check" className="button register-actions__primary">
              {t("dns.recheck")}
            </PendingButton>
          </form>
        )}
      </div>
    </section>
  );
}
