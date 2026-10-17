import { Badge } from "@/components/ui/badge";
import { TableWrap } from "@/components/ui/table-wrap";
import type { ServiceStatus } from "@/services/platform/status.service";
import { STATE_LABEL } from "../constants";

const dash = (value: string | number | null) => (value === null ? "—" : value);

export function StatusTable({ services }: { services: ServiceStatus[] }) {
  return (
    <TableWrap labelledBy="status-caption">
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
          {services.map((s) => {
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
    </TableWrap>
  );
}
