import Link from "next/link";
import { ROUTES } from "@/configs/routes.config";
import type { LogEntry } from "@/services/transparency/transparency.model";
import { actionLabel, actorLabel, hashPreview, timeWib } from "../lib/log-entry";

/** Penpot `Log terbaru`: the newest entries of the public decision log on the ink surface. */
export function LatestLog({ entries }: { entries: LogEntry[] | null }) {
  return (
    <section className="latest-log" aria-labelledby="latest-log-heading" data-testid="latest-log">
      <div className="latest-log__head">
        <h2 id="latest-log-heading">Latest log</h2>
        <Link href={ROUTES.log}>See all</Link>
      </div>
      {entries === null ? (
        <p className="latest-log__empty">The decision log did not answer. Please try again in a moment.</p>
      ) : entries.length === 0 ? (
        <p className="latest-log__empty">No decisions recorded yet.</p>
      ) : (
        <ol>
          {entries.map((e) => (
            <li key={e.seq}>
              <Link href={ROUTES.logEntry(e.seq)} className="latest-log__entry">
                <span className="latest-log__meta">
                  <span className="latest-log__seq">#{String(e.seq).padStart(4, "0")}</span>
                  <span>
                    <time dateTime={e.recorded_at}>{timeWib(e.recorded_at)}</time> · {actorLabel(e)}
                  </span>
                </span>
                <span className="latest-log__decision">{actionLabel(e.action)}</span>
                <code className="latest-log__hash" title={e.hash}>
                  {hashPreview(e.hash)}
                </code>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
