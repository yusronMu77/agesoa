import { EvidenceBadge } from "@agesoa/ui/components/evidence-badge";
import { Badge } from "@agesoa/ui/components/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@agesoa/ui/components/empty";
import { LogoMark } from "@agesoa/ui/components/logo";
import { useEffect, useState } from "react";
import type { IngestionClient, PackDocument, Report } from "../api";
import { Notice } from "../components";
import { T, t } from "../copy";
import { button } from "../ui";
import { reportIds } from "../reports";
import { reportCode } from "./Submitted";

const DAY = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric" });

type Loaded = { id: string; report: Report | null };

function titleOf(report: Report, pack: PackDocument | null): string {
  const category = pack?.categories.find((c) => c.id === report.category)?.label.id;
  const place = report.region?.district_name ?? report.region?.regency_name;
  if (category && place) return t("TXT-WIT-253", { kategori: category, wilayah: place });
  return category ?? report.narrative?.slice(0, 80) ?? reportCode(report);
}

function statusOf(report: Report): "alleged" | "supported" | "proven" {
  const level = report.evidence_status?.max_finding_status;
  return level === "proven" || level === "supported" ? level : "alleged";
}

const STATUS_TEXT = { alleged: T["TXT-EVD-001"], supported: T["TXT-EVD-002"], proven: T["TXT-EVD-003"] } as const;

/** SCR-008 My reports: the reports sent from this device, with their evidence status. No account, no names. */
export function MyReports({
  client,
  pack,
  questionCount,
  onQuestions,
  onNew,
}: {
  client: IngestionClient;
  pack: PackDocument | null;
  questionCount: number;
  onQuestions: () => void;
  onNew: () => void;
}) {
  const [items, setItems] = useState<Loaded[] | null>(null);

  useEffect(() => {
    let live = true;
    const ids = reportIds();
    void Promise.all(
      ids.map((id) =>
        client.getReport(id).then(
          (report): Loaded => ({ id, report }),
          (): Loaded => ({ id, report: null }),
        ),
      ),
    ).then((list) => live && setItems(list));
    return () => {
      live = false;
    };
  }, [client]);

  const submitted = (items ?? []).filter((item) => item.report === null || item.report.status === "submitted");
  return (
    <main className="screen" data-screen="SCR-008">
      <div className="intro">
        <h1>{T["TXT-WIT-160"]}</h1>
        <p className="lead">{T["TXT-WIT-161"]}</p>
      </div>
      {questionCount > 0 && (
        <Notice tone="info" title={t("TXT-WIT-147", { jumlah: questionCount })}>
          <button type="button" className={button("link")} onClick={onQuestions}>
            {T["TXT-WIT-148"]}
          </button>
        </Notice>
      )}
      {items === null ? (
        <p className="lead" role="status">
          {T["TXT-WIT-246"]}
        </p>
      ) : submitted.length === 0 ? (
        <Empty data-testid="no-reports">
          <EmptyHeader>
            <EmptyMedia>
              <LogoMark size={72} />
            </EmptyMedia>
            <EmptyTitle>{T["TXT-WIT-234"]}</EmptyTitle>
            <EmptyDescription>{T["TXT-WIT-235"]}</EmptyDescription>
          </EmptyHeader>
          <button type="button" className={button("neutral")} onClick={onNew}>
            {T["TXT-WIT-117"]}
          </button>
        </Empty>
      ) : (
        <ul className="stack" aria-label={T["TXT-WIT-160"]}>
          {submitted.map(({ id, report }) => (
            <li key={id} className="card report-card" data-testid="my-report">
              {report ? (
                <>
                  <div className="report-card-head">
                    <span className="mono">{reportCode(report)}</span>
                    {report.submitted_at && <span>{DAY.format(new Date(report.submitted_at))}</span>}
                  </div>
                  <p className="report-card-title">{titleOf(report, pack)}</p>
                  <div className="row">
                    <EvidenceBadge status={statusOf(report)}>{STATUS_TEXT[statusOf(report)]}</EvidenceBadge>
                    <Badge variant="neutral">{T["TXT-WIT-204"]}</Badge>
                  </div>
                </>
              ) : (
                <p className="lead">{T["TXT-WIT-247"]}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
