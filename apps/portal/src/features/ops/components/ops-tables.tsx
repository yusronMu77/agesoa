import { Badge } from "@/components/ui/badge";
import { TableWrap } from "@/components/ui/table-wrap";
import { formatTime } from "@/lib/format";
import type { OpsEvents } from "@/services/platform/ops.service";
import type { StatusReport } from "@/services/platform/status.service";
import { AGENTS } from "../constants";
import type { OpsData } from "../server/load-ops";

function sum(events: OpsData["events"], pick: (e: OpsEvents) => number): number | null {
  const ok = events.flatMap(({ result }) => (result.ok ? [result.data] : []));
  return ok.length === 0 ? null : ok.reduce((total, e) => total + pick(e), 0);
}

/** SCR-090 tiles: totals over the rows below (no extra call); "—" when no service answered. */
export function OpsStats({ services, events }: { services: StatusReport["services"]; events: OpsData["events"] }) {
  const ready = services.filter((s) => s.state === "ready").length;
  const failing = sum(events, (e) => e.outbox_failing);
  const tiles = [
    { label: "Services ready", value: `${ready} / ${services.length}`, accent: ready < services.length },
    { label: "Published", value: sum(events, (e) => e.outbox_published) ?? "—", accent: false },
    { label: "Pending", value: sum(events, (e) => e.outbox_pending) ?? "—", accent: false },
    { label: "Failing", value: failing ?? "—", accent: (failing ?? 0) > 0 },
    { label: "Processed", value: sum(events, (e) => e.inbox_processed) ?? "—", accent: false },
  ];
  return (
    <ul className="ws-stats" aria-label="Totals">
      {tiles.map((t) => (
        <li key={t.label} className="ws-stat">
          <span className="ws-stat__label">{t.label}</span>
          <span className={t.accent ? "ws-stat__value ws-stat__value--accent" : "ws-stat__value"}>{t.value}</span>
        </li>
      ))}
    </ul>
  );
}

/** One row per service: its agents, readiness and outbox/inbox counts ("—" when the operator call failed). */
export function OpsServicesTable({ services, events }: { services: StatusReport["services"]; events: OpsData["events"] }) {
  return (
    <TableWrap label="Services and agents">
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
          {services.map((s) => {
            const ev = events.find((e) => e.service === s.service)?.result;
            const data = ev?.ok ? ev.data : null;
            return (
              <tr key={s.service} data-testid="ops-service" data-service={s.service}>
                <th scope="row">{s.service}</th>
                <td className="ws-muted-cell">{AGENTS[s.service].join(", ")}</td>
                <td>
                  <Badge tone={s.state === "ready" ? "ok" : "warn"} icon={false}>
                    {s.state}
                  </Badge>
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
    </TableWrap>
  );
}

/** Event types each service published (`out`) or received (`in`), with their count and last time. */
export function EventTypesTable({ events }: { events: OpsData["events"] }) {
  return (
    <TableWrap label="Events by type">
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
                    <td className="ws-nowrap">{t.last_at ? formatTime(t.last_at) : "—"}</td>
                  </tr>
                ))
              : [],
          )}
        </tbody>
      </table>
    </TableWrap>
  );
}
