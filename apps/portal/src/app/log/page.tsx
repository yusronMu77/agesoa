import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/Badge";
import { loadConfig } from "@/lib/config";
import { formatTime, shortHash } from "@/lib/format";
import type { FetchResult } from "@/lib/http";
import {
  getLogHead,
  getLogPage,
  LOG_PAGE_SIZE,
  type LogVerification,
  parseSeq,
  verifyLog,
} from "@/lib/transparency";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Decision log" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function ChainBadge({ result }: { result: FetchResult<LogVerification> }) {
  if (!result.ok) {
    return (
      <Badge tone="neutral" testId="chain-status">
        Chain verification unavailable
      </Badge>
    );
  }
  const v = result.data;
  if (v.ok) {
    return (
      <Badge tone="ok" testId="chain-status">
        Chain verified · {v.length} {v.length === 1 ? "entry" : "entries"}
        {v.head_hash ? (
          <>
            {" "}
            · head <code title={v.head_hash}>{shortHash(v.head_hash)}</code>
          </>
        ) : null}
      </Badge>
    );
  }
  return (
    <Badge tone="error" testId="chain-status">
      Chain broken{v.first_invalid_seq !== null ? ` at entry #${v.first_invalid_seq}` : ""}
      {v.reason ? `: ${v.reason}` : ""}
    </Badge>
  );
}

export default async function LogPage({ searchParams }: { searchParams: SearchParams }) {
  const config = loadConfig();
  const after = parseSeq((await searchParams).after) ?? 0;

  const [page, verification, head] = await Promise.all([
    getLogPage(config, { after, limit: LOG_PAGE_SIZE }),
    verifyLog(config),
    getLogHead(config),
  ]);

  const headSeq = head.ok ? head.data.seq : null;
  const nextAfter = page.ok ? page.data.next_after : null;
  const hasNext = nextAfter !== null && (headSeq === null || nextAfter < headSeq);
  const prevAfter = after > 0 ? Math.max(0, after - LOG_PAGE_SIZE) : null;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Decision log</h1>
          <p className="muted">
            Public, append-only record of decisions. Each entry stores the hash of the entry before it, so any
            change to history breaks the chain.
          </p>
        </div>
        <ChainBadge result={verification} />
      </div>

      {!page.ok ? (
        <section className="callout callout--error" aria-labelledby="log-error">
          <h2 id="log-error">The decision log is temporarily unavailable</h2>
          <p>The transparency service did not answer ({page.error}). Please try again in a moment.</p>
        </section>
      ) : page.data.items.length === 0 ? (
        <section className="callout" aria-labelledby="log-empty">
          <h2 id="log-empty">{after > 0 ? "No more entries" : "No decisions recorded yet"}</h2>
          <p>
            {after > 0 ? (
              <Link href="/log">Back to the first page</Link>
            ) : (
              "Decisions appear here as soon as they are recorded."
            )}
          </p>
        </section>
      ) : (
        <>
          <div className="table-wrap" role="region" aria-labelledby="log-caption" tabIndex={0}>
            <table data-testid="log-table">
              <caption id="log-caption">
                Entries {page.data.items[0].seq}–{page.data.items[page.data.items.length - 1].seq}
                {headSeq !== null ? ` of ${headSeq}` : ""}, oldest first. Times in UTC.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="num">
                    Seq
                  </th>
                  <th scope="col">Recorded</th>
                  <th scope="col">Source service</th>
                  <th scope="col">Action</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Hash</th>
                  <th scope="col">Previous hash</th>
                </tr>
              </thead>
              <tbody>
                {page.data.items.map((item) => (
                  <tr key={item.seq}>
                    <td className="num">
                      <Link href={`/log/${item.seq}`} aria-label={`Entry ${item.seq}`}>
                        #{item.seq}
                      </Link>
                    </td>
                    <td>
                      <time dateTime={item.recorded_at}>{formatTime(item.recorded_at)}</time>
                    </td>
                    <td>{item.source_service}</td>
                    <td>
                      <code>{item.action}</code>
                    </td>
                    <td>
                      {item.subject_kind}: <code>{item.subject_id}</code>
                    </td>
                    <td>
                      <code title={item.hash}>{shortHash(item.hash)}</code>
                    </td>
                    <td>
                      <code title={item.prev_hash}>{shortHash(item.prev_hash)}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className="pagination" aria-label="Log pages">
            <ul>
              {prevAfter !== null ? (
                <li>
                  <Link href={prevAfter > 0 ? `/log?after=${prevAfter}` : "/log"} rel="prev">
                    ← Previous {LOG_PAGE_SIZE}
                  </Link>
                </li>
              ) : null}
              {hasNext ? (
                <li>
                  <Link href={`/log?after=${nextAfter}`} rel="next">
                    Next {LOG_PAGE_SIZE} →
                  </Link>
                </li>
              ) : null}
            </ul>
          </nav>
        </>
      )}
    </>
  );
}
