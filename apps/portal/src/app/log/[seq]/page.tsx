import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/Badge";
import { loadConfig } from "@/lib/config";
import { formatTime, GENESIS_HASH } from "@/lib/format";
import { getLogEntry, getLogHead, LOG_PAGE_SIZE, parseSeq } from "@/lib/transparency";

export const dynamic = "force-dynamic";

type Params = Promise<{ seq: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const seq = parseSeq((await params).seq);
  return { title: seq ? `Decision #${seq}` : "Decision" };
}

export default async function LogEntryPage({ params }: { params: Params }) {
  const seq = parseSeq((await params).seq);
  if (seq === undefined || seq < 1) notFound();

  const config = loadConfig();
  const [entry, previous, head] = await Promise.all([
    getLogEntry(config, seq),
    seq > 1 ? getLogEntry(config, seq - 1) : Promise.resolve(null),
    getLogHead(config),
  ]);

  if (!entry.ok && entry.status === 404) notFound();

  if (!entry.ok) {
    return (
      <>
        <h1>Decision #{seq}</h1>
        <section className="callout callout--error" aria-labelledby="entry-error">
          <h2 id="entry-error">This entry is temporarily unavailable</h2>
          <p>The transparency service did not answer ({entry.error}). Please try again in a moment.</p>
          <p>
            <Link href="/log">Back to the decision log</Link>
          </p>
        </section>
      </>
    );
  }

  const item = entry.data;
  const isGenesis = item.seq === 1 && item.prev_hash === GENESIS_HASH;
  const linkMatches = previous?.ok ? previous.data.hash === item.prev_hash : null;
  const headSeq = head.ok ? head.data.seq : null;
  const pageAfter = Math.floor((item.seq - 1) / LOG_PAGE_SIZE) * LOG_PAGE_SIZE;

  return (
    <>
      <div className="page-header">
        <div>
          <p className="muted">
            <Link href={pageAfter > 0 ? `/log?after=${pageAfter}` : "/log"}>← Decision log</Link>
          </p>
          <h1>Decision #{item.seq}</h1>
        </div>
        {isGenesis ? (
          <Badge tone="ok" testId="link-status">
            First entry (genesis)
          </Badge>
        ) : linkMatches === true ? (
          <Badge tone="ok" testId="link-status">
            Linked to entry #{item.seq - 1}
          </Badge>
        ) : linkMatches === false ? (
          <Badge tone="error" testId="link-status">
            Previous hash does not match entry #{item.seq - 1}
          </Badge>
        ) : (
          <Badge tone="neutral" testId="link-status">
            Link to previous entry not checked
          </Badge>
        )}
      </div>

      <dl className="fields">
        <dt>Recorded</dt>
        <dd>
          <time dateTime={item.recorded_at}>{formatTime(item.recorded_at)}</time>
        </dd>
        <dt>Source service</dt>
        <dd>{item.source_service}</dd>
        <dt>Action</dt>
        <dd>
          <code>{item.action}</code>
        </dd>
        <dt>Subject</dt>
        <dd>
          {item.subject_kind}: <code>{item.subject_id}</code>
        </dd>
        <dt>Decision ID</dt>
        <dd>
          <code>{item.decision_id}</code>
        </dd>
        <dt>Event ID</dt>
        <dd>
          <code>{item.event_id}</code>
        </dd>
        <dt>Hash</dt>
        <dd>
          <code data-testid="entry-hash">{item.hash}</code>
        </dd>
        <dt>Previous hash</dt>
        <dd>
          {item.seq > 1 ? (
            <Link href={`/log/${item.seq - 1}`} aria-label={`Previous hash, entry ${item.seq - 1}`}>
              <code>{item.prev_hash}</code>
            </Link>
          ) : (
            <code>{item.prev_hash}</code>
          )}
        </dd>
      </dl>

      <section aria-labelledby="entry-json">
        <h2 id="entry-json">Entry (as hashed)</h2>
        <pre className="json" tabIndex={0} aria-label="Entry JSON">
          <code>{JSON.stringify(item.entry, null, 2)}</code>
        </pre>
      </section>

      <nav className="pagination" aria-label="Neighbouring entries">
        <ul>
          {item.seq > 1 ? (
            <li>
              <Link href={`/log/${item.seq - 1}`} rel="prev">
                ← Entry #{item.seq - 1}
              </Link>
            </li>
          ) : null}
          {headSeq !== null && item.seq < headSeq ? (
            <li>
              <Link href={`/log/${item.seq + 1}`} rel="next">
                Entry #{item.seq + 1} →
              </Link>
            </li>
          ) : null}
        </ul>
      </nav>
    </>
  );
}
