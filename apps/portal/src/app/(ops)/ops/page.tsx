import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConfirmSubmit } from "@/components/console/ConfirmSubmit";
import { ConsoleContext } from "@/components/console/ConsoleContext";
import { OpsConsole } from "@/components/console/Consoles";
import { KpiTiles } from "@/components/console/KpiTiles";
import { loadConfig } from "@/lib/config";
import { formatClock, opsTotals, recentEvents } from "@/lib/console-view";
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
  // Only the confirm button of the dialog (PRV-reset-demo) sends `confirm`; a direct submit is refused.
  if (formData.get("confirm") !== "on") redirect("/ops?reset=unconfirmed#demo");
  const report = await resetDemo(loadConfig(), token);
  const failed = report.steps.filter((s) => !s.ok).map((s) => `${s.service}: ${s.detail}`);
  redirect(
    `/ops?reset=${report.ok ? "ok" : "failed"}&seconds=${report.seconds}` +
      (failed.length ? `&error=${encodeURIComponent(failed.join("; "))}` : "") +
      "#demo",
  );
}

/** SCR-090 machine status: services, events, outbox and the demo mode. Read-only except the demo reset. */
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
  const recent = recentEvents(data, 4);
  const ready = status.services.filter((s) => s.state === "ready").length;
  const slowest = status.services.reduce((max, s) => Math.max(max, s.latency_ms), 0);
  const checkedTime = formatClock(lang, status.checked_at);
  const n = (value: number) => formatNumber(lang, value);
  const overallTone = status.overall === "ok" ? "badge--ok" : status.overall === "down" ? "badge--error" : "badge--warn";

  const context = (
    <ConsoleContext
      action="/ops"
      label={t("console.context.label")}
      applyLabel={t("console.context.apply")}
      hint={t("console.context.hint")}
      selects={[
        {
          name: "env",
          label: t("console.context.environment"),
          value: config.appEnv,
          options: [{ value: config.appEnv, label: config.appEnv }],
        },
      ]}
    />
  );

  return (
    <OpsConsole section="machine" context={context}>
      <div className="page-intro page-intro--split">
        <div>
          <h1>{t("ops.title")}</h1>
          <p>{t("ops.intro")}</p>
        </div>
        <span className={`badge ${overallTone}`} data-testid="overall-status">
          {t(`ops.overall.${status.overall}`)}
        </span>
      </div>
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
            sub: t("ops.kpi.readySub", { at: checkedTime }),
          },
          {
            label: t("ops.kpi.published"),
            value: n(totals.published),
            sub: t("ops.kpi.publishedSub", { n: n(totals.failing) }),
          },
          { label: t("ops.kpi.pending"), value: n(totals.pending), sub: t("ops.kpi.pendingSub", { n: totals.reporting }) },
          { label: t("ops.kpi.latency"), value: `${slowest} ms`, sub: t("ops.kpi.latencySub") },
        ]}
      />

      <div className="ops-grid">
        <section className="card ops-card" aria-labelledby="services-heading">
          <h2 id="services-heading">{t("ops.services")}</h2>
          <ul className="service-list">
            {status.services.map((s) => (
              <li key={s.service} className="service-row">
                <span className="service-row__text">
                  <span className="service-row__name">{s.service}</span>
                  <span className="service-row__meta">
                    {AGENTS[s.service].join(", ")} · {t("ops.rev", { rev: s.release ?? "—" })} · {s.latency_ms} ms
                  </span>
                </span>
                <span className={`badge ${s.state === "ready" ? "badge--ok" : s.state === "down" ? "badge--error" : "badge--warn"}`}>
                  {t(`ops.state.${s.state}`)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="stack">
          <section className="card ops-card" aria-labelledby="recent-heading">
            <h2 id="recent-heading">{t("ops.recent")}</h2>
            {recent.length > 0 ? (
              <ul className="event-list" data-testid="ops-recent">
                {recent.map((e, index) => (
                  <li key={`${index}-${e.service}-${e.event_type}`}>
                    <span className="event-list__type">{e.event_type.replace(/^agesoa\./, "")}</span>
                    <time dateTime={e.at} title={formatDateTime(lang, e.at)}>
                      {formatClock(lang, e.at, true)}
                    </time>
                    <span className="sr-only">
                      {" "}
                      · {e.service} · {t(`ops.dir.${e.direction}`)} · {e.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t("ops.recentEmpty")}</p>
            )}
          </section>

          <section aria-labelledby="demo-heading" className="card ops-card" id="demo" data-testid="demo-reset">
            <div className="section-title">
              <h2 id="demo-heading">{t("ops.demo")}</h2>
              <span className="demo-switch">
                <span className={`demo-switch__track${config.demoMode ? " demo-switch__track--on" : ""}`} aria-hidden="true">
                  <span className="demo-switch__thumb" />
                </span>
                {config.demoMode ? t("ops.demoOn") : t("ops.demoOff")}
              </span>
            </div>
            {reset === "ok" ? (
              <div className="callout callout--success callout--inline" role="status" data-testid="reset-result">
                <p className="callout__title">{t("ops.resetDoneTitle")}</p>
                <p>{t("ops.resetDone", { s: String(seconds ?? "—") })}</p>
              </div>
            ) : reset === "failed" ? (
              <p className="callout callout--error callout--inline" role="alert" data-testid="reset-result">
                {t("ops.resetFailed", { s: String(seconds ?? "—"), error: typeof error === "string" ? error : t("ops.resetUnknown") })}
              </p>
            ) : reset === "unconfirmed" ? (
              <p className="callout callout--error callout--inline" role="alert" data-testid="reset-result">
                {t("ops.resetUnconfirmed")}
              </p>
            ) : null}
            {config.demoMode ? (
              <form action={runReset} className="ops-reset">
                <p className="muted">{t("ops.demoMode")}</p>
                <div className="callout callout--error callout--inline">
                  <p className="callout__title">
                    <TriangleAlert aria-hidden size={20} strokeWidth={2} />
                    {t("ops.resetTitle")}
                  </p>
                  <p>{t("ops.resetBody")}</p>
                </div>
                <ConfirmSubmit
                  className="button button--danger ops-reset__button"
                  confirmClassName="button button--danger"
                  testId="reset-button"
                  confirmTestId="reset-confirm"
                  confirmField={{ name: "confirm", value: "on" }}
                  title={t("ops.resetDialog.title")}
                  body={t("ops.resetDialog.body", { env: config.appEnv })}
                  confirmLabel={t("ops.resetDialog.yes")}
                  cancelLabel={t("decide.confirm.cancel")}
                  pendingLabel={t("ops.resetting")}
                >
                  {t("ops.resetButton")}
                </ConfirmSubmit>
                <p className="footnote">
                  {t("ops.resetScript")} <code>scripts/demo/reset_demo.py</code>.
                </p>
              </form>
            ) : (
              <p className="muted">{t("ops.demoOnly")}</p>
            )}
          </section>
        </div>
      </div>

      <section aria-labelledby="outbox-heading" className="ops-section" id="outbox">
        <h2 id="outbox-heading" className="section-title">
          {t("ops.outbox")}
        </h2>
        {totals.reporting > 0 && totals.pending === 0 && totals.failing === 0 ? (
          <div className="callout callout--inline" data-testid="outbox-empty">
            <p className="callout__title">{t("ops.outboxEmptyTitle")}</p>
            <p>{t("ops.outboxEmpty")}</p>
          </div>
        ) : null}
        <div className="table-wrap" role="region" aria-labelledby="outbox-heading" tabIndex={0}>
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

      <section aria-labelledby="types-heading" className="ops-section" id="events">
        <h2 id="types-heading" className="section-title">
          {t("ops.types")}
        </h2>
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
    </OpsConsole>
  );
}
