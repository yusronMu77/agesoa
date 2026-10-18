import type { Metadata } from "next";
import { Badge, type BadgeTone } from "@/components/Badge";
import { KpiTiles } from "@/components/console/KpiTiles";
import { loadConfig } from "@/lib/config";
import { formatDateTime } from "@/lib/i18n/core";
import { getT } from "@/lib/i18n/server";
import { getStatusReport, type OverallState, type ServiceState } from "@/lib/status";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("status.meta") };
}

const STATE_TONE: Record<ServiceState, BadgeTone> = { ready: "ok", not_ready: "warn", down: "error" };
const OVERALL_TONE: Record<OverallState, BadgeTone> = { ok: "ok", degraded: "warn", down: "error" };

const dash = (value: string | number | null) => (value === null ? "—" : value);

/** Readiness of the five backend services (public, read-only; machine-readable at /api/status). */
export default async function StatusPage() {
  const config = loadConfig();
  const { lang, t } = await getT();
  const report = await getStatusReport(config);
  const ready = report.services.filter((s) => s.state === "ready").length;
  const slowest = report.services.reduce((max, s) => Math.max(max, s.latency_ms), 0);
  const outbox = report.services.reduce((sum, s) => sum + (s.outbox_pending ?? 0), 0);
  // The time sits inside the sentence as a <time> element: split the message at its placeholder.
  const [checkedBefore, checkedAfter = ""] = t("status.checked").split("{at}");

  return (
    <>
      <div className="page-intro page-intro--split">
        <div>
          <h1>{t("status.title")}</h1>
          <p>
            {checkedBefore}
            <time dateTime={report.checked_at}>{formatDateTime(lang, report.checked_at)}</time>
            {checkedAfter}
          </p>
        </div>
        <Badge tone={OVERALL_TONE[report.overall]} testId="overall-status">
          {t(`status.overall.${report.overall}`)}
        </Badge>
      </div>

      <KpiTiles
        label={t("status.title")}
        items={[
          { label: t("status.kpi.ready"), value: t("ops.kpi.readyValue", { n: ready, total: report.services.length }) },
          { label: t("status.kpi.slowest"), value: `${slowest} ms` },
          { label: t("status.kpi.outbox"), value: outbox },
        ]}
      />

      <div className="table-wrap" role="region" aria-labelledby="status-caption" tabIndex={0}>
        <table data-testid="status-table">
          <caption id="status-caption">{t("status.caption")}</caption>
          <thead>
            <tr>
              <th scope="col">{t("status.col.service")}</th>
              <th scope="col">{t("status.col.status")}</th>
              <th scope="col">{t("status.col.release")}</th>
              <th scope="col">{t("status.col.environment")}</th>
              <th scope="col">{t("status.col.database")}</th>
              <th scope="col" className="num">
                {t("status.col.outbox")}
              </th>
              <th scope="col" className="num">
                {t("status.col.latency")}
              </th>
            </tr>
          </thead>
          <tbody>
            {report.services.map((s) => (
              <tr key={s.service} data-service={s.service}>
                <th scope="row">
                  <code>{s.service}</code>
                </th>
                <td>
                  <Badge tone={STATE_TONE[s.state]}>{t(`status.state.${s.state}`)}</Badge>
                  {s.error ? <div className="muted">{s.error}</div> : null}
                </td>
                <td>
                  <code>{dash(s.release)}</code>
                </td>
                <td>{dash(s.environment)}</td>
                <td>
                  {s.database.name ? <code>{s.database.name}</code> : "—"}
                  {s.database.ok === false ? <div className="muted">{t("status.dbUnavailable")}</div> : null}
                </td>
                <td className="num">{dash(s.outbox_pending)}</td>
                <td className="num">{s.latency_ms} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted callout--after">
        {t("status.machine")} <a href="/api/status">/api/status</a>
      </p>
    </>
  );
}
