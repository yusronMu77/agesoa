import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { TableWrap } from "@/components/ui/table-wrap";
import { ROUTES } from "@/configs/routes.config";
import { formatTime } from "@/lib/format";
import type { Delivery, Institution } from "@/services/delivery/delivery.model";
import type { FetchResult } from "@/services/http/fetch-json";
import { DELIVERY_EVENT_LABEL, DELIVERY_STATUS_LABEL, DELIVERY_STATUS_TONE } from "../constants";
import { attemptsSummary } from "../lib/attempts";
import { ApiKeyForm, TestEventForm, WebhookForm } from "./institution-forms";

function DeliveryTable({ deliveries }: { deliveries: Delivery[] }) {
  return (
    <TableWrap labelledBy="deliveries-heading">
      <table data-testid="delivery-history">
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Event</th>
            <th scope="col">Case</th>
            <th scope="col">Status</th>
            <th scope="col">Internal ticket</th>
            <th scope="col">Attempts</th>
          </tr>
        </thead>
        <tbody>
          {deliveries.map((d) => (
            <tr key={d.delivery_id} data-testid="delivery-row" data-status={d.status} data-delivery-id={d.delivery_id}>
              <td>
                <time dateTime={d.created_at}>{formatTime(d.created_at)}</time>
              </td>
              <td>{DELIVERY_EVENT_LABEL[d.event] ?? d.event}</td>
              <td>{d.event === "test_event" ? <code>{d.case_id}</code> : <Link href={ROUTES.case(d.case_id)}>{d.case_id}</Link>}</td>
              <td>
                <Badge tone={DELIVERY_STATUS_TONE[d.status] ?? "warn"} icon={false}>
                  {DELIVERY_STATUS_LABEL[d.status] ?? d.status}
                </Badge>
              </td>
              <td>{d.internal_ticket ?? "—"}</td>
              <td>{attemptsSummary(d.attempts)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

/** SCR-062: webhook subscription, test event, API key and the delivery history of a verified agency. */
export function InstitutionIntegration({
  organizationId,
  institution,
  deliveries,
}: {
  organizationId: string;
  institution: Institution;
  deliveries: FetchResult<Delivery[]> | null;
}) {
  const { subscription, api_key: apiKey } = institution;
  return (
    <section aria-labelledby="integration-heading" data-testid="institution-integration">
      <div className="ws-intro">
        <h2 id="integration-heading">Institution integration</h2>
        <p>
          Receive final audit reports in your own system: AGESOA sends a signed webhook (HMAC with your secret) for each
          final report that matches your filters; your system can also call the institution API with an API key to
          report follow-up and send a right of reply.
        </p>
      </div>

      <div className="ws-grid ws-grid--wide-side">
        <div className="ws-stack">
          <div className="ws-subcard">
            <h3>Webhook</h3>
            {subscription ? (
              <p className="ws-strip" data-testid="webhook-subscription">
                Current webhook: <code>{subscription.webhook_url}</code> · region {subscription.region_code ?? "all"} ·
                category {subscription.category ?? "all"} · since {formatTime(subscription.created_at)}
              </p>
            ) : (
              <p className="muted" data-testid="webhook-subscription">
                No webhook yet.
              </p>
            )}
            <WebhookForm organizationId={organizationId} subscription={subscription} />
            <TestEventForm organizationId={organizationId} />
          </div>

          <div className="ws-subcard">
            <h3>API key</h3>
            {apiKey ? (
              <p className="ws-strip">
                Current key: <code data-testid="api-key-prefix">{apiKey.prefix}</code>… · created{" "}
                {formatTime(apiKey.created_at)}
              </p>
            ) : (
              <p className="muted">No API key yet.</p>
            )}
            <ApiKeyForm organizationId={organizationId} hasKey={apiKey !== null} />
          </div>
        </div>

        <div className="ws-subcard ws-table ws-table--compact">
          <PageHeader
            bare
            aside={
              <a
                href={ROUTES.organization(organizationId)}
                className={buttonClass("secondary")}
                data-testid="refresh-deliveries"
              >
                Refresh
              </a>
            }
          >
            <h3 id="deliveries-heading">Delivery history</h3>
          </PageHeader>
          {deliveries?.ok ? (
            deliveries.data.length > 0 ? (
              <DeliveryTable deliveries={deliveries.data} />
            ) : (
              <p className="muted" data-testid="deliveries-empty">
                No deliveries yet.
              </p>
            )
          ) : (
            <Callout tone="error">The delivery history could not be loaded ({deliveries?.error}).</Callout>
          )}
        </div>
      </div>
    </section>
  );
}
