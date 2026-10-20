import { Check, CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ConsoleContext } from "@/components/console/ConsoleContext";
import { ValidatorConsole } from "@/components/console/Consoles";
import { KpiTiles } from "@/components/console/KpiTiles";
import { EvidenceBadge } from "@/components/EvidenceBadge";
import { Localized } from "@/components/Localized";
import { validatorStatusText } from "@/components/ValidatorHeader";
import { loadConfig } from "@/lib/config";
import {
  byDeadline,
  type DeadlineView,
  deadlineView,
  inQueueContext,
  isOverdue,
  inQueueFilter,
  parseQueueFilter,
  QUEUE_FILTERS,
  type QueueFilter,
  queueSummary,
  regionName,
  shortRegion,
} from "@/lib/console-view";
import { loadDomainPacks, packName } from "@/lib/domainpacks";
import { formatDate, formatDateTime, type Translate } from "@/lib/i18n/core";
import { getT } from "@/lib/i18n/server";
import { ROUTES, signInHref } from "@/lib/routes";
import { sessionToken } from "@/lib/session";
import { getMyProfile, getValidationRequest, listValidationRequests, type ValidationDetail, type ValidationRequest } from "@/lib/trust";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("queue.meta") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type QueueRow = ValidationRequest & Partial<Pick<ValidationDetail, "quorum">>;

/** Detail calls for the quorum count are capped so a long demo queue stays fast. */
const DETAIL_LIMIT = 60;
/** Approvals from different organizations that make a quorum (trust quorum.MIN_ORGANIZATIONS). */
const QUORUM_SIZE = 2;

const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");

/** "Besok", "2 hari", "Lewat tenggat": the relative deadline of the queue column and KPI. */
function deadlineText(t: Translate, view: DeadlineView): string {
  if (view.kind === "none") return "—";
  if (view.kind === "days") return t("queue.due.days", { n: view.days });
  return t(`queue.due.${view.kind}`);
}

function queueHref(filter: QueueFilter, context: { domain: string; region: string }): string {
  const query = new URLSearchParams();
  if (filter !== "waiting") query.set("filter", filter);
  if (context.domain) query.set("domain", context.domain);
  if (context.region) query.set("region", context.region);
  const qs = query.toString();
  return qs ? `${ROUTES.validator}?${qs}` : ROUTES.validator;
}

/** SCR-022: the validator's queue. Reading only; deciding happens on SCR-020. */
export default async function ValidatePage({ searchParams }: { searchParams: SearchParams }) {
  const token = await sessionToken();
  if (!token) redirect(signInHref(ROUTES.validator));
  const config = loadConfig();
  const { lang, t } = await getT();
  const [profile, requests] = await Promise.all([getMyProfile(config, token), listValidationRequests(config, token)]);
  if (!profile.ok && (profile.status === 401 || profile.status === null)) redirect(signInHref(ROUTES.validator));
  const query = await searchParams;
  const done = query.done;
  const doneDecision = one(query.decision);
  const filter = parseQueueFilter(query.filter);
  const context = { domain: one(query.domain), region: one(query.region) };

  const me = profile.ok ? profile.data : null;
  const blocked = me !== null && !["active", "probation"].includes(me.status);
  const rows: QueueRow[] =
    requests.ok && !blocked
      ? byDeadline(
          await Promise.all(
            requests.data.map(async (r, index) => {
              if (index >= DETAIL_LIMIT) return r;
              const detail = await getValidationRequest(config, token, r.finding_id);
              return detail.ok ? { ...r, quorum: detail.data.quorum, my_decision: detail.data.my_decision ?? r.my_decision } : r;
            }),
          ),
        )
      : [];
  const packs = await loadDomainPacks(config, rows.map((r) => r.domain));
  const inContext = rows.filter((r) => inQueueContext(r, context));
  const summary = queueSummary(inContext);
  const visible = inContext.filter((r) => inQueueFilter(r, filter));
  const domains = [...new Set(rows.map((r) => r.domain))].sort();
  const regions = [...new Set(rows.map((r) => regionName(r)).filter((r): r is string => r !== null))].sort();
  const regionText = context.region || me?.region?.regency_name;
  const nearest = summary.nearest;
  const nearestView = deadlineView(nearest?.deadline_at);
  const decidedView = filter === "decided";

  const topbar = (
    <ConsoleContext
      action={ROUTES.validator}
      label={t("console.context.label")}
      applyLabel={t("console.context.apply")}
      hint={t("console.context.hint")}
      keep={filter !== "waiting" ? { filter } : {}}
      selects={[
        {
          name: "domain",
          label: t("console.context.issueType"),
          value: context.domain,
          options: [
            { value: "", label: t("console.context.issueType.all") },
            ...domains.map((d) => ({ value: d, label: packName(packs, d, lang) })),
          ],
        },
        {
          name: "region",
          label: t("console.context.region"),
          value: context.region,
          options: [
            { value: "", label: me?.region?.regency_name ?? t("console.context.region.all") },
            ...regions.map((r) => ({ value: r, label: r })),
          ],
        },
      ]}
    />
  );

  return (
    <ValidatorConsole profile={me} section={filter === "decided" ? "decisions" : "queue"} context={topbar}>
      <div className="page-intro">
        <h1>{decidedView ? t("console.validator.nav.decisions") : t("queue.title")}</h1>
        <p>
          {decidedView ? t("queue.decidedIntro") : regionText ? t("queue.introRegion", { region: regionText }) : t("queue.intro")}
        </p>
      </div>
      {me ? null : (
        <p className="callout callout--error" data-testid="not-validator">
          {t("queue.notValidator")} <Link href={ROUTES.validatorRegister}>{t("queue.becomeValidator")}</Link>.
        </p>
      )}
      {me && blocked ? (
        <p className="callout callout--warning" data-testid="registration-pending">
          {t("queue.pending", { status: validatorStatusText(t, me.status) })}{" "}
          <Link href={ROUTES.validatorRegister}>{t("queue.pendingLink")}</Link>.
        </p>
      ) : null}
      {typeof done === "string" ? (
        <div className="callout callout--success" role="status" data-testid="decision-done">
          <p className="callout__title">
            <CircleCheck aria-hidden size={20} strokeWidth={2} />
            {t("queue.doneTitle")}
          </p>
          <p>
            {t(doneDecision === "needs_evidence" ? "queue.doneEvidence" : "queue.done", { id: done })}{" "}
            <Link href={ROUTES.validatorLog}>{t("queue.doneLog")}</Link>
          </p>
        </div>
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
              {
                label: t("queue.kpi.waiting"),
                value: summary.waiting,
                sub: summary.overdue > 0 ? t("queue.kpi.overdueSub", { n: summary.overdue }) : t("queue.kpi.waitingSub", { n: summary.total }),
              },
              {
                label: t("queue.kpi.evidence"),
                value: summary.evidence,
                sub: t("queue.kpi.evidenceSub", { n: summary.evidenceRequests }),
              },
              {
                label: t("queue.kpi.decided"),
                value: summary.decided,
                sub: t("queue.kpi.decidedSub", { a: summary.approved, r: summary.rejected }),
              },
              {
                label: t("queue.kpi.nearest"),
                value: deadlineText(t, nearestView),
                sub: nearest
                  ? [nearest.finding_id, shortRegion(nearest)].filter(Boolean).join(", ")
                  : t("queue.kpi.nearestNone"),
              },
            ]}
          />
          <nav aria-label={t("queue.filter.label")}>
            <ul className="chips">
              {QUEUE_FILTERS.map((f) => (
                <li key={f}>
                  <Link
                    href={queueHref(f, context)}
                    className="chip"
                    aria-current={f === filter ? "page" : undefined}
                    data-testid={`queue-filter-${f}`}
                  >
                    {f === filter ? <Check aria-hidden size={18} strokeWidth={2} /> : null}
                    {t(`queue.filter.${f}`)}
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
            <div className="table-wrap queue-wrap" role="region" aria-labelledby="queue-caption" tabIndex={0}>
              <table className="queue-table" data-testid="validation-queue">
                <caption id="queue-caption" className="sr-only">
                  {t("queue.table.caption")}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{t("queue.col.finding")}</th>
                    <th scope="col">{t("queue.col.domain")}</th>
                    <th scope="col">{t("queue.col.evidence")}</th>
                    <th scope="col">{t("queue.col.region")}</th>
                    <th scope="col">{t("queue.col.quorum")}</th>
                    <th scope="col">{t("queue.col.deadline")}</th>
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
                        {r.state === "needs_evidence" ? (
                          <span className="badge badge--warn queue-chip" data-testid="queue-chip-evidence">
                            {t("queue.filter.evidence")}
                          </span>
                        ) : null}
                        {r.synthetic ? <p className="cell-finding__meta">{t("queue.synthetic")}</p> : null}
                      </td>
                      <td data-label={t("queue.col.domain")}>{packName(packs, r.domain, lang)}</td>
                      <td>
                        <EvidenceBadge status={r.status_label} lang={lang} />
                      </td>
                      <td data-label={t("queue.col.region")} title={regionName(r) ?? undefined}>
                        {shortRegion(r) ?? "—"}
                      </td>
                      <td data-label={t("queue.col.quorum")}>
                        {r.quorum ? (
                          <>
                            {t("queue.quorumOf", { a: r.quorum.approvals, n: QUORUM_SIZE })}
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
                      <td data-label={t("queue.col.deadline")} data-testid="queue-deadline">
                        {r.deadline_at ? (
                          <time
                            dateTime={r.deadline_at}
                            title={formatDateTime(lang, r.deadline_at)}
                            className={isOverdue(r) ? "deadline--overdue" : undefined}
                          >
                            {deadlineText(t, deadlineView(r.deadline_at))}
                          </time>
                        ) : (
                          <span title={t("queue.receivedAt", { at: formatDate(lang, r.received_at) })}>—</span>
                        )}
                      </td>
                      <td className="cell-action">
                        <Link href={ROUTES.validatorFinding(r.finding_id)} className="button button--secondary queue-open">
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
    </ValidatorConsole>
  );
}
