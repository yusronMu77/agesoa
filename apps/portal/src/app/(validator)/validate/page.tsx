import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { KpiTiles } from "@/components/console/KpiTiles";
import { EvidenceBadge } from "@/components/EvidenceBadge";
import { ValidatorHeader, validatorStatusText } from "@/components/ValidatorHeader";
import { loadConfig } from "@/lib/config";
import { inQueueFilter, parseQueueFilter, QUEUE_FILTERS, queueSummary, regionName } from "@/lib/console-view";
import { formatDateTime } from "@/lib/i18n/core";
import { getT } from "@/lib/i18n/server";
import { sessionToken } from "@/lib/session";
import { getMyProfile, getValidationRequest, listValidationRequests, type ValidationDetail, type ValidationRequest } from "@/lib/trust";
import { Localized } from "@/components/Localized";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("queue.meta") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type QueueRow = ValidationRequest & Partial<Pick<ValidationDetail, "quorum" | "my_decision">>;

/** Detail calls for the quorum and my own decision are capped so a long demo queue stays fast. */
const DETAIL_LIMIT = 60;

/** SCR-022: the validator's queue. Reading only; deciding happens on SCR-020. */
export default async function ValidatePage({ searchParams }: { searchParams: SearchParams }) {
  const token = await sessionToken();
  if (!token) redirect("/login?next=/validate");
  const config = loadConfig();
  const { lang, t } = await getT();
  const [profile, requests] = await Promise.all([getMyProfile(config, token), listValidationRequests(config, token)]);
  if (!profile.ok && (profile.status === 401 || profile.status === null)) redirect("/login?next=/validate");
  const query = await searchParams;
  const done = query.done;
  const filter = parseQueueFilter(query.filter);

  const me = profile.ok ? profile.data : null;
  const blocked = me !== null && !["active", "probation"].includes(me.status);
  const rows: QueueRow[] =
    requests.ok && !blocked
      ? await Promise.all(
          requests.data.map(async (r, index) => {
            if (index >= DETAIL_LIMIT) return r;
            const detail = await getValidationRequest(config, token, r.finding_id);
            return detail.ok ? { ...r, quorum: detail.data.quorum, my_decision: detail.data.my_decision } : r;
          }),
        )
      : [];
  const summary = queueSummary(rows);
  const visible = rows.filter((r) => inQueueFilter(r, filter));
  const region = me?.region?.regency_name;
  const counts = { waiting: summary.waiting, decided: summary.decided, all: summary.total };

  return (
    <>
      <div className="page-intro">
        <h1>{t("queue.title")}</h1>
        <p>{region ? t("queue.introRegion", { region }) : t("queue.intro")}</p>
      </div>
      {me ? (
        <ValidatorHeader profile={me} />
      ) : (
        <p className="callout callout--error" data-testid="not-validator">
          {t("queue.notValidator")} <Link href="/validators/register">{t("queue.becomeValidator")}</Link>.
        </p>
      )}
      {me && blocked ? (
        <p className="callout callout--warning" data-testid="registration-pending">
          {t("queue.pending", { status: validatorStatusText(t, me.status) })}{" "}
          <Link href="/validators/register">{t("queue.pendingLink")}</Link>.
        </p>
      ) : null}
      {typeof done === "string" ? (
        <p className="callout callout--success" role="status" data-testid="decision-done">
          {t("queue.done", { id: done })}
        </p>
      ) : null}

      {blocked ? null : !requests.ok ? (
        <p className="callout callout--error">{t("queue.unavailable", { error: requests.error })}</p>
      ) : rows.length === 0 ? (
        <p className="callout" data-testid="queue-empty">
          {t("queue.empty")}
        </p>
      ) : (
        <>
          <KpiTiles
            label={t("queue.title")}
            items={[
              { label: t("queue.kpi.waiting"), value: summary.waiting, sub: t("queue.kpi.waitingSub", { n: summary.total }) },
              { label: t("queue.kpi.decided"), value: summary.decided, sub: t("queue.kpi.decidedSub") },
              {
                label: t("queue.kpi.oldest"),
                value: summary.oldestWaiting ? formatDateTime(lang, summary.oldestWaiting).split(",")[0] : t("queue.kpi.oldestNone"),
                sub: summary.oldestWaiting ? `${t("queue.kpi.oldestSub")} ${formatDateTime(lang, summary.oldestWaiting)}` : undefined,
              },
            ]}
          />
          <nav aria-label={t("queue.filter.label")}>
            <ul className="chips">
              {QUEUE_FILTERS.map((f) => (
                <li key={f}>
                  <Link
                    href={f === "waiting" ? "/validate" : `/validate?filter=${f}`}
                    className="chip"
                    aria-current={f === filter ? "page" : undefined}
                    data-testid={`queue-filter-${f}`}
                  >
                    {t(`queue.filter.${f}`)} <span className="chip__count">{counts[f]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {visible.length === 0 ? (
            <p className="callout" data-testid="queue-filter-empty">
              {t("queue.emptyFilter")}
            </p>
          ) : (
            <div className="table-wrap" role="region" aria-labelledby="queue-caption" tabIndex={0}>
              <table className="queue-table" data-testid="validation-queue">
                <caption id="queue-caption" className="sr-only">
                  {t("queue.table.caption")}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{t("queue.col.finding")}</th>
                    <th scope="col">{t("queue.col.evidence")}</th>
                    <th scope="col">{t("queue.col.region")}</th>
                    <th scope="col">{t("queue.col.quorum")}</th>
                    <th scope="col">{t("queue.col.received")}</th>
                    <th scope="col">
                      <span className="sr-only">{t("queue.col.action")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.finding_id} data-testid="validation-item">
                      <td className="cell-finding">
                        <p className="cell-finding__statement">
                          <Localized lang={lang} plain={r.statement} i18n={r.statement_i18n} />
                        </p>
                        <p className="cell-finding__meta">
                          {t("queue.case", { id: r.case_id })} · {r.domain}
                          {r.synthetic ? ` · ${t("queue.synthetic")}` : ""}
                        </p>
                      </td>
                      <td>
                        <EvidenceBadge status={r.status_label} lang={lang} />
                      </td>
                      <td data-label={t("queue.col.region")}>{regionName(r) ?? "—"}</td>
                      <td data-label={t("queue.col.quorum")}>
                        {r.quorum ? (
                          <>
                            {t("queue.quorumCounts", { a: r.quorum.approvals, r: r.quorum.rejections })}
                            {r.my_decision ? (
                              <div className="cell-finding__meta">
                                {t("queue.myDecision", { decision: t(`decision.${r.my_decision}`) })}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td data-label={t("queue.col.received")}>
                        <time dateTime={r.received_at}>{formatDateTime(lang, r.received_at)}</time>
                      </td>
                      <td className="cell-action">
                        <Link href={`/validate/${encodeURIComponent(r.finding_id)}`} className="button button--secondary button--small">
                          {t("queue.open")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
