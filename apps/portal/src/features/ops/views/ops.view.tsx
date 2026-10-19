import { Callout } from "@/components/ui/callout";
import { formatTime } from "@/lib/format";
import { type DemoResetResult, DemoResetPanel } from "../components/demo-reset";
import { EventTypesTable, OpsServicesTable, OpsStats } from "../components/ops-tables";
import type { OpsData } from "../server/load-ops";

/** SCR-090, tab "Machine": what the agents and services are doing. Read-only: no write to any case content. */
export function OpsView({ demoMode, status, events, denied, reset }: OpsData & { reset: DemoResetResult }) {
  return (
    <>
      <div className="ws-intro">
        <h1>Operations</h1>
        <nav aria-label="Operations tabs" className="tabs">
          <span className="tab tab--active" aria-current="page">
            Machine
          </span>
        </nav>
        <p>
          Agents and services at work: readiness, events each service published (outbox) and processed (inbox).
          Counts and event types only — no case content. Checked {formatTime(status.checked_at)}.
        </p>
      </div>
      {denied ? (
        <Callout tone="error" data-testid="not-operator">
          This account is not an operator.
        </Callout>
      ) : null}

      <OpsStats services={status.services} events={events} />

      <section aria-labelledby="services-heading" className="card ws-table mb-6">
        <h2 id="services-heading">Services and agents</h2>
        <OpsServicesTable services={status.services} events={events} />
      </section>

      <div className="ws-grid">
        <section aria-labelledby="types-heading" className="card ws-table ws-table--compact">
          <h2 id="types-heading">Events by type</h2>
          <EventTypesTable events={events} />
        </section>

        <DemoResetPanel demoMode={demoMode} result={reset} />
      </div>
    </>
  );
}
