/**
 * SCR-008 My reports: the reports sent from this device (ids kept on the device, see reports.ts), each read from
 * ingestion. A report that cannot be loaded shows a calm row with a retry; it never blocks the list.
 */

import { useCallback, useEffect, useState } from "react";
import type { IngestionClient, PackDocument, Report } from "../api";
import { EmptyState, EvidenceBadge } from "../components";
import { language, pick, t, T } from "../copy";
import { formatDay } from "../fields";
import { Icon } from "../icons";
import { reportCodeOf } from "../reports";

type Entry = { state: "loading" } | { state: "error" } | { state: "ok"; report: Report };

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
  onRetry,
}: {
  id: string;
  entry: Entry;
  packs: Record<string, PackDocument>;
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
        <span className="tag tag--info">
          {report.status === "submitted" ? T["TXT-WIT-172"] : T["TXT-WIT-239"]}
        </span>
        {report.evidence.length > 0 && <span className="tag">{t("TXT-WIT-234", { n: report.evidence.length })}</span>}
        {report.evidence_status?.status === "likely_lost" && (
          <span className="tag tag--warning">{T["TXT-WIT-238"]}</span>
        )}
        {report.synthetic && <span className="tag tag--sim">{T["TXT-WIT-118"]}</span>}
      </div>
    </li>
  );
}

export function MyReports({
  client,
  ids,
  packs,
  onNew,
}: {
  client: IngestionClient;
  /** Newest first. */
  ids: string[];
  /** Loaded domain packs by id: each report is labelled with its own issue type's categories. */
  packs: Record<string, PackDocument>;
  onNew: () => void;
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

  return (
    <main className="screen" data-screen="SCR-008">
      <div className="intro">
        <h1>{T["TXT-WIT-160"]}</h1>
        <p className="lead">{T["TXT-WIT-161"]}</p>
      </div>
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
              onRetry={() => load(id)}
            />
          ))}
        </ul>
      )}
    </main>
  );
}
