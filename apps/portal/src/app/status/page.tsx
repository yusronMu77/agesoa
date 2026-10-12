import type { Metadata } from "next";
import { Badge, type BadgeTone } from "@/components/Badge";
import { loadConfig } from "@/lib/config";
import { formatTime } from "@/lib/format";
import { getStatusReport, type OverallState, type ServiceState } from "@/lib/status";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Service status" };

const STATE_LABEL: Record<ServiceState, { tone: BadgeTone; label: string }> = {
  ready: { tone: "ok", label: "Ready" },
  not_ready: { tone: "warn", label: "Not ready" },
  down: { tone: "error", label: "Down" },
};

const OVERALL_LABEL: Record<OverallState, { tone: BadgeTone; label: string }> = {
  ok: { tone: "ok", label: "All services ready" },
  degraded: { tone: "warn", label: "Some services are not ready" },
  down: { tone: "error", label: "All services are down" },
};

const dash = (value: string | number | null) => (value === null ? "—" : value);

export default async function StatusPage() {
  const config = loadConfig();
  const report = await getStatusReport(config);
  const overall = OVERALL_LABEL[report.overall];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Service status</h1>
          <p className="muted">
            Checked <time dateTime={report.checked_at}>{formatTime(report.checked_at)}</time>. Reload the page to
            check again.
          </p>
        </div>
        <Badge tone={overall.tone} testId="overall-status">
          {overall.label}
        </Badge>
      </div>

      <div className="table-wrap" role="region" aria-labelledby="status-caption" tabIndex={0}>
        <table data-testid="status-table">
          <caption id="status-caption">Readiness of the backend services (GET /readyz, 3 s timeout each).</caption>
          <thead>
            <tr>
              <th scope="col">Service</th>
              <th scope="col">Status</th>
              <th scope="col">Release</th>
              <th scope="col">Environment</th>
              <th scope="col">Database</th>
              <th scope="col" className="num">
                Outbox pending
              </th>
              <th scope="col" className="num">
                Response time
              </th>
            </tr>
          </thead>
          <tbody>
            {report.services.map((s) => {
              const state = STATE_LABEL[s.state];
              return (
                <tr key={s.service} data-service={s.service}>
                  <th scope="row">{s.service}</th>
                  <td>
                    <Badge tone={state.tone}>{state.label}</Badge>
                    {s.error ? <div className="muted">{s.error}</div> : null}
                  </td>
                  <td>
                    <code>{dash(s.release)}</code>
                  </td>
                  <td>{dash(s.environment)}</td>
                  <td>
                    {s.database.name ? <code>{s.database.name}</code> : "—"}
                    {s.database.ok === false ? <div className="muted">unavailable</div> : null}
                  </td>
                  <td className="num">{dash(s.outbox_pending)}</td>
                  <td className="num">{s.latency_ms} ms</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ marginTop: "var(--ag-space-4)" }}>
        Machine-readable: <a href="/api/status">/api/status</a>
      </p>
    </>
  );
}
