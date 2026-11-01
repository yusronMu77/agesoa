import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { latestFirst } from "@/lib/console-view";
import { formatDateTime, type Lang, type Translate } from "@/lib/i18n/core";
import type { Delivery } from "@/lib/institutions";
import { ROUTES } from "@/lib/routes";

const TONE = { delivered: "badge--ok", failed: "badge--error", pending: "badge--warn", held: "badge--neutral" } as const;

/**
 * Delivery history of an agency (SCR-062): event and case, time and attempt, the HTTP answer of the last attempt.
 * The status word stays readable for screen readers next to the code; failed deliveries get one warning below. A case
 * opens inside the organization console.
 */
export function DeliveryList({
  organizationId,
  deliveries,
  t,
  lang,
  limit,
}: {
  organizationId: string;
  deliveries: Delivery[];
  t: Translate;
  lang: Lang;
  limit?: number;
}) {
  const rows = latestFirst(deliveries, limit);
  const failed = deliveries.filter((d) => d.status === "failed");
  return (
    <>
      <ul className="delivery-list" data-testid="delivery-history" aria-labelledby="deliveries-heading">
        {rows.map((d) => {
          const last = [...d.attempts].sort((a, b) => b.attempt - a.attempt)[0];
          const code = last?.http_status ?? null;
          return (
            <li key={d.delivery_id} className="delivery-row" data-testid="delivery-row" data-status={d.status} data-delivery-id={d.delivery_id}>
              <div className="delivery-row__body">
                <p className="delivery-row__title">
                  {t(`deliveryEvent.${d.event}`)}{" "}
                  {d.event === "test_event" ? (
                    <code>{d.case_id}</code>
                  ) : (
                    <Link href={ROUTES.organizationCase(organizationId, d.case_id)}>{d.case_id}</Link>
                  )}
                </p>
                <p className="delivery-row__meta">
                  <time dateTime={d.created_at}>{formatDateTime(lang, d.created_at)}</time> ·{" "}
                  {t("int.attempt", { n: last?.attempt ?? 0 })}
                  {d.status === "pending" && d.attempts.length > 0 ? `, ${t("int.rescheduled")}` : ""}
                  {d.status === "held" && d.held_at ? ` · ${t("int.heldAt", { at: formatDateTime(lang, d.held_at) })}` : ""}
                  {d.internal_ticket ? ` · ${t("int.ticket", { ticket: d.internal_ticket })}` : ""}
                </p>
              </div>
              <span className={`badge ${TONE[d.status] ?? "badge--neutral"}`} data-testid="delivery-status">
                {code ?? t(`delivery.${d.status}`)}
                {code !== null ? <span className="sr-only"> · {t(`delivery.${d.status}`)}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
      {failed.length > 0 ? (
        <div className="callout callout--warning callout--after">
          <p className="callout__title">
            <TriangleAlert aria-hidden size={20} strokeWidth={2} />
            {t("int.failedTitle", { n: failed.length })}
          </p>
          <p>{failed.length === 1 ? failedOne(failed[0], t) : t("int.failedBody")}</p>
        </div>
      ) : null}
    </>
  );
}

/** UX-035: "Sistem tujuan belum menerima T-11 (HTTP 500). …" for one failed delivery, with its last HTTP answer. */
function failedOne(d: Delivery, t: Translate): string {
  const last = [...d.attempts].sort((a, b) => b.attempt - a.attempt)[0];
  const code = last?.http_status ?? last?.error ?? "—";
  return t("int.failedOne", { id: d.case_id, code: String(code) });
}
