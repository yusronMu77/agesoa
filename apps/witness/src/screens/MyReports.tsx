/**
 * SCR-008 My reports: the reports sent from this device (ids kept on the device, see reports.ts), each read from
 * ingestion. A report that cannot be loaded shows a calm row with a retry; it never blocks the list.
 */

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import type { IngestionClient, PackDocument, Report } from "../api";
import { EmptyState, EvidenceBadge } from "../components";
import { language, pick, t, T } from "../copy";
import { formatDay } from "../fields";
import { Icon } from "../icons";
import { MAX_REPORTS, reportCodeOf } from "../reports";

type Entry = { state: "loading" } | { state: "error" } | { state: "ok"; report: Report };

/**
 * The report the waiting audit questions belong to (TXT-WIT-162 "{n} pertanyaan menunggu"), or null when that is not
 * certain. Questions are addressed to this device as the reporter of a case, and the service does not say which
 * report of the device a case grew from; so they are attributed only when the device has exactly one submitted
 * report and the list is complete (every row loaded, nothing dropped from the device list).
 */
export function questionsReport(ids: string[], entries: Record<string, Entry>, waiting: number): string | null {
  if (waiting <= 0 || ids.length >= MAX_REPORTS) return null;
  const rows = ids.map((id) => entries[id]);
  if (rows.some((row) => !row || row.state !== "ok")) return null;
  const submitted = rows.flatMap((row) => (row?.state === "ok" && row.report.status === "submitted" ? [row.report.id] : []));
  return submitted.length === 1 ? submitted[0] : null;
}

export function reportTitle(report: Report, pack: PackDocument | null): string {
  const category = report.category
    ? pick(pack?.categories.find((c) => c.id === report.category)?.label) || report.category
    : T["TXT-WIT-233"];
  const region = report.region?.district_name ?? report.region?.regency_name;
  return region ? t("TXT-WIT-232", { kategori: category, wilayah: region }) : category;
}

function ReportRow({
  id,
  entry,
  packs,
  waiting,
  onRetry,
}: {
  id: string;
  entry: Entry;
  packs: Record<string, PackDocument>;
  /** Audit questions waiting for this report (0 when none or unknown). */
  waiting: number;
  onRetry: () => void;
}) {
  const code = <span className="report-row-code mono">{reportCodeOf(id)}</span>;
  if (entry.state === "loading") {
    return (
      <li className="card report-row" aria-busy="true">
        <div className="report-row-head">{code}</div>
        <p className="skeleton">{T["TXT-WIT-235"]}</p>
      </li>
    );
  }
  if (entry.state === "error") {
    return (
      <li className="card report-row" data-testid="my-report-error">
        <div className="report-row-head">{code}</div>
        <p className="report-row-note">
          <Icon name="info" size={20} />
          {T["TXT-WIT-236"]}
        </p>
        <button type="button" className="button small" onClick={onRetry}>
          {T["TXT-WIT-237"]}
        </button>
      </li>
    );
  }
  const { report } = entry;
  const when = report.submitted_at ?? report.created_at;
  return (
    <li className="card report-row" data-testid="my-report">
      <div className="report-row-head">
        {code}
        {when && <time dateTime={when}>{formatDay(when, language())}</time>}
      </div>
      <p className="report-row-title">{reportTitle(report, packs[report.domain] ?? null)}</p>
      <div className="row">
        <EvidenceBadge level="alleged" />
        {waiting > 0 ? (
          <span className="tag tag--warning" data-testid="my-report-questions">
            {t("TXT-WIT-162", { n: waiting })}
          </span>
        ) : (
          <span className="tag tag--info">{report.status === "submitted" ? T["TXT-WIT-404"] : T["TXT-WIT-239"]}</span>
        )}
        {report.evidence_status?.status === "likely_lost" && (
          <span className="tag tag--warning">{T["TXT-WIT-238"]}</span>
        )}
      </div>
    </li>
  );
}

export function MyReports({
  client,
  ids,
  packs,
  onNew,
  waiting = 0,
  banner,
}: {
  client: IngestionClient;
  /** Newest first. */
  ids: string[];
  /** Loaded domain packs by id: each report is labelled with its own issue type's categories. */
  packs: Record<string, PackDocument>;
  onNew: () => void;
  /** Audit questions waiting for this device. */
  waiting?: number;
  /** The audit questions banner, shown under the intro (SCR-008). */
  banner?: ReactNode;
}) {
  const [entries, setEntries] = useState<Record<string, Entry>>({});

  const load = useCallback(
    (id: string) => {
      setEntries((current) => ({ ...current, [id]: { state: "loading" } }));
      client.getReport(id).then(
        (report) => setEntries((current) => ({ ...current, [id]: { state: "ok", report } })),
        () => setEntries((current) => ({ ...current, [id]: { state: "error" } })),
      );
    },
    [client],
  );

  useEffect(() => {
    ids.forEach(load);
  }, [ids, load]);
  const withQuestions = questionsReport(ids, entries, waiting);

  return (
    <main className="screen" data-screen="SCR-008">
      <div className="intro">
        <h1>{T["TXT-WIT-160"]}</h1>
        <p className="lead">{T["TXT-WIT-161"]}</p>
      </div>
      {banner}
      {ids.length === 0 ? (
        <EmptyState
          title={T["TXT-WIT-230"]}
          testId="my-reports-empty"
          action={
            <button type="button" className="button secondary" onClick={onNew}>
              {T["TXT-WIT-117"]}
            </button>
          }
        >
          {T["TXT-WIT-231"]}
        </EmptyState>
      ) : (
        <ul className="report-list" aria-label={T["TXT-WIT-160"]}>
          {ids.map((id) => (
            <ReportRow
              key={id}
              id={id}
              entry={entries[id] ?? { state: "loading" }}
              packs={packs}
              waiting={id === withQuestions ? waiting : 0}
              onRetry={() => load(id)}
            />
          ))}
        </ul>
      )}
    </main>
  );
}
