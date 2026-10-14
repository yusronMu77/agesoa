import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loadConfig } from "@/lib/config";
import { formatTime } from "@/lib/format";
import { AGENTS, serviceEvents } from "@/lib/ops";
import { sessionToken } from "@/lib/session";
import { getStatusReport } from "@/lib/status";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Operations" };

/** SCR-090, tab "Machine": what the agents and services are doing. Read-only: no write to any case content. */
export default async function OpsPage() {
  const token = await sessionToken();
  if (!token) redirect("/login?next=/ops");
  const config = loadConfig();
  const [status, events] = await Promise.all([getStatusReport(config), serviceEvents(config, token)]);
  const denied = events.every((e) => !e.result.ok && (e.result.status === 401 || e.result.status === 403));
  if (events.every((e) => !e.result.ok && e.result.status === 401)) redirect("/login?next=/ops");

  return (
    <>
      <h1>Operations</h1>
      <nav aria-label="Operations tabs" className="tabs">
        <span className="tab tab--active" aria-current="page">
          Machine
        </span>
      </nav>
      <p className="muted">
        Agents and services at work: readiness, events each service published (outbox) and processed (inbox). Counts
        and event types only — no case content. Checked {formatTime(status.checked_at)}.
      </p>
      {denied ? (
        <p className="callout callout--error" data-testid="not-operator">
          This account is not an operator.
        </p>
      ) : null}

      <div className="table-wrap" role="region" aria-label="Services and agents" tabIndex={0}>
        <table data-testid="ops-services">
          <thead>
            <tr>
              <th scope="col">Service</th>
              <th scope="col">Agents</th>
              <th scope="col">Status</th>
              <th scope="col" className="num">
                Published
              </th>
              <th scope="col" className="num">
                Pending
              </th>
              <th scope="col" className="num">
                Failing
              </th>
              <th scope="col" className="num">
                Processed
              </th>
            </tr>
          </thead>
          <tbody>
            {status.services.map((s) => {
              const ev = events.find((e) => e.service === s.service)?.result;
              const data = ev?.ok ? ev.data : null;
              return (
                <tr key={s.service} data-testid="ops-service" data-service={s.service}>
                  <th scope="row">{s.service}</th>
                  <td>{AGENTS[s.service].join(", ")}</td>
                  <td>
                    <span className={`badge ${s.state === "ready" ? "badge--ok" : "badge--warn"}`}>{s.state}</span>
                  </td>
                  <td className="num">{data?.outbox_published ?? "—"}</td>
                  <td className="num">{data?.outbox_pending ?? "—"}</td>
                  <td className="num">{data?.outbox_failing ?? "—"}</td>
                  <td className="num">{data?.inbox_processed ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section aria-labelledby="types-heading">
        <h2 id="types-heading">Events by type</h2>
        <div className="table-wrap" role="region" aria-label="Events by type" tabIndex={0}>
          <table data-testid="ops-event-types">
            <thead>
              <tr>
                <th scope="col">Service</th>
                <th scope="col">Direction</th>
                <th scope="col">Event</th>
                <th scope="col" className="num">
                  Count
                </th>
                <th scope="col">Last</th>
              </tr>
            </thead>
            <tbody>
              {events.flatMap(({ service, result }) =>
                result.ok
                  ? result.data.by_type.map((t) => (
                      <tr key={`${service}-${t.direction}-${t.event_type}`}>
                        <td>{service}</td>
                        <td>{t.direction === "out" ? "published" : "received"}</td>
                        <td>
                          <code>{t.event_type.replace(/^agesoa\./, "")}</code>
                        </td>
                        <td className="num">{t.count}</td>
                        <td>{t.last_at ? formatTime(t.last_at) : "—"}</td>
                      </tr>
                    ))
                  : [],
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="demo-heading" className="card">
        <h2 id="demo-heading">Demo data</h2>
        <p className="muted">
          Resetting the demo data comes with the demo seed script (issue #68); this tab never changes case content.
        </p>
      </section>
    </>
  );
}
