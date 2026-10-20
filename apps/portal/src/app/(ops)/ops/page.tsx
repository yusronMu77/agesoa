import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KpiTiles } from "@/components/console/KpiTiles";
import { PendingButton } from "@/components/console/PendingButton";
import { loadConfig } from "@/lib/config";
import { opsTotals, recentEvents } from "@/lib/console-view";
import { formatDateTime, formatNumber } from "@/lib/i18n/core";
import { getT } from "@/lib/i18n/server";
import { AGENTS, resetDemo, serviceEvents } from "@/lib/ops";
import { sessionToken } from "@/lib/session";
import { getStatusReport } from "@/lib/status";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("ops.meta") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function runReset(formData: FormData) {
  "use server";
  const token = await sessionToken();
  if (!token) redirect("/login?next=/ops");
  if (formData.get("confirm") !== "on") redirect("/ops?reset=unconfirmed");
  const report = await resetDemo(loadConfig(), token);
  const failed = report.steps.filter((s) => !s.ok).map((s) => `${s.service}: ${s.detail}`);
  redirect(
    `/ops?reset=${report.ok ? "ok" : "failed"}&seconds=${report.seconds}` +
      (failed.length ? `&error=${encodeURIComponent(failed.join("; "))}` : ""),
  );
}

/** SCR-090, tab "Machine": what the agents and services are doing. Read-only: no write to any case content. */
export default async function OpsPage({ searchParams }: { searchParams: SearchParams }) {
  const token = await sessionToken();
  if (!token) redirect("/login?next=/ops");
  const config = loadConfig();
  const { lang, t } = await getT();
  const [status, events] = await Promise.all([getStatusReport(config), serviceEvents(config, token)]);
  const denied = events.every((e) => !e.result.ok && (e.result.status === 401 || e.result.status === 403));
  if (events.every((e) => !e.result.ok && e.result.status === 401)) redirect("/login?next=/ops");
  const { reset, seconds, error } = await searchParams;

  const data = events.map((e) => ({ service: e.service as string, data: e.result.ok ? e.result.data : null }));
  const totals = opsTotals(data.map((d) => d.data));
  const recent = recentEvents(data);
  const ready = status.services.filter((s) => s.state === "ready").length;
  const checked = formatDateTime(lang, status.checked_at);
  const n = (value: number) => formatNumber(lang, value);

  return (
    <>
      <div className="page-intro">
        <h1>{t("ops.title")}</h1>
      </div>
      <nav aria-label={t("ops.tabs")} className="tabs">
        <span className="tab tab--active" aria-current="page">
          {t("ops.tab.machine")}
        </span>
      </nav>
      <p className="muted">{t("ops.intro", { at: checked })}</p>
      {denied ? (
        <p className="callout callout--error" data-testid="not-operator">
          {t("ops.notOperator")}
        </p>
      ) : null}

      <KpiTiles
        label={t("ops.title")}
        items={[
          {
            label: t("ops.kpi.ready"),
            value: t("ops.kpi.readyValue", { n: ready, total: status.services.length }),
            sub: t("ops.kpi.readySub", { at: checked }),
          },
          {
            label: t("ops.kpi.published"),
            value: n(totals.published),
            sub: t("ops.kpi.publishedSub", { n: totals.reporting }),
          },
          { label: t("ops.kpi.pending"), value: n(totals.pending), sub: t("ops.kpi.pendingSub", { n: n(totals.failing) }) },
          { label: t("ops.kpi.processed"), value: n(totals.processed), sub: t("ops.kpi.processedSub") },
        ]}
      />

      <section aria-labelledby="services-heading" className="stack stack--tight ops-section">
        <h2 id="services-heading" className="section-title">
          {t("ops.services")}
        </h2>
        <div className="table-wrap" role="region" aria-labelledby="services-heading" tabIndex={0}>
          <table data-testid="ops-services">
            <thead>
              <tr>
                <th scope="col">{t("ops.col.service")}</th>
                <th scope="col">{t("ops.col.agents")}</th>
                <th scope="col">{t("ops.col.status")}</th>
                <th scope="col" className="num">
                  {t("ops.col.published")}
                </th>
                <th scope="col" className="num">
                  {t("ops.col.pending")}
                </th>
                <th scope="col" className="num">
                  {t("ops.col.failing")}
                </th>
                <th scope="col" className="num">
                  {t("ops.col.processed")}
                </th>
              </tr>
            </thead>
            <tbody>
              {status.services.map((s) => {
                const ev = events.find((e) => e.service === s.service)?.result;
                const row = ev?.ok ? ev.data : null;
                return (
                  <tr key={s.service} data-testid="ops-service" data-service={s.service}>
                    <th scope="row">
                      <code>{s.service}</code>
                    </th>
                    <td>{AGENTS[s.service].join(", ")}</td>
                    <td>
                      <span className={`badge ${s.state === "ready" ? "badge--ok" : s.state === "down" ? "badge--error" : "badge--warn"}`}>
                        {t(`ops.state.${s.state}`)}
                      </span>
                    </td>
                    <td className="num">{row?.outbox_published ?? "—"}</td>
                    <td className="num">{row?.outbox_pending ?? "—"}</td>
                    <td className="num">{row?.outbox_failing ?? "—"}</td>
                    <td className="num">{row?.inbox_processed ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="ops-grid">
        <section className="card" aria-labelledby="recent-heading">
            <h2 id="recent-heading">{t("ops.recent")}</h2>
            {recent.length > 0 ? (
              <ul className="event-list" data-testid="ops-recent">
                {recent.map((e, index) => (
                  <li key={`${index}-${e.service}-${e.event_type}`}>
                    <code>{e.event_type.replace(/^agesoa\./, "")}</code>
                    <time dateTime={e.at}>{formatDateTime(lang, e.at)}</time>
                    <span className="event-list__meta">
                      {e.service} · {t(`ops.dir.${e.direction}`)} · {e.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t("ops.recentEmpty")}</p>
            )}
          </section>

          <section aria-labelledby="demo-heading" className="card" data-testid="demo-reset">
            <h2 id="demo-heading">{t("ops.demo")}</h2>
            {reset === "ok" ? (
              <p className="callout callout--success" role="status" data-testid="reset-result">
                {t("ops.resetDone", { s: String(seconds ?? "—") })}
              </p>
            ) : reset === "failed" ? (
              <p className="callout callout--error" role="alert" data-testid="reset-result">
                {t("ops.resetFailed", { s: String(seconds ?? "—"), error: typeof error === "string" ? error : t("ops.resetUnknown") })}
              </p>
            ) : reset === "unconfirmed" ? (
              <p className="callout callout--error" role="alert" data-testid="reset-result">
                {t("ops.resetUnconfirmed")}
              </p>
            ) : null}
            {config.demoMode ? (
              <form action={runReset} className="form">
                <p className="muted">{t("ops.demoMode")}</p>
                <div className="callout callout--error callout--inline">
                  <p className="callout__title">
                    <TriangleAlert aria-hidden size={18} strokeWidth={2} />
                    {t("ops.resetTitle")}
                  </p>
                  <p>
                    {t("ops.resetBody")} <code>scripts/demo/reset_demo.py</code>.
                  </p>
                </div>
                <label>
                  <input type="checkbox" name="confirm" /> {t("ops.resetConfirm")}
                </label>
                <PendingButton pendingLabel={t("ops.resetting")} className="button button--danger" testId="reset-button">
                  {t("ops.resetButton")}
                </PendingButton>
              </form>
            ) : (
              <p className="muted">{t("ops.demoOnly")}</p>
            )}
          </section>
      </div>

      <section aria-labelledby="types-heading">
        <h2 id="types-heading">{t("ops.types")}</h2>
        <div className="table-wrap" role="region" aria-labelledby="types-heading" tabIndex={0}>
          <table data-testid="ops-event-types">
            <thead>
              <tr>
                <th scope="col">{t("ops.col.service")}</th>
                <th scope="col">{t("ops.col.direction")}</th>
                <th scope="col">{t("ops.col.event")}</th>
                <th scope="col" className="num">
                  {t("ops.col.count")}
                </th>
                <th scope="col">{t("ops.col.last")}</th>
              </tr>
            </thead>
            <tbody>
              {events.flatMap(({ service, result }) =>
                result.ok
                  ? result.data.by_type.map((ty, index) => (
                      <tr key={`${service}-${ty.direction}-${ty.event_type}-${index}`}>
                        <td>{service}</td>
                        <td>{t(`ops.dir.${ty.direction}`)}</td>
                        <td>
                          <code>{ty.event_type.replace(/^agesoa\./, "")}</code>
                        </td>
                        <td className="num">{ty.count}</td>
                        <td>{ty.last_at ? formatDateTime(lang, ty.last_at) : "—"}</td>
                      </tr>
                    ))
                  : [],
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
