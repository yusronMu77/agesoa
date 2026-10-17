import Link from "next/link";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/ui/callout";
import { Pagination } from "@/components/ui/pagination";
import { ROUTES } from "@/configs/routes.config";
import { formatTime } from "@/lib/format";
import { LinkStatusBadge } from "../components/chain-badge";
import type { LogEntryData } from "../server/load-log";

/** SCR-042: one decision with its full hash and the link to the entry before it. */
export function LogEntryView(data: LogEntryData) {
  if (!data.ok) {
    return (
      <>
        <h1>Decision #{data.seq}</h1>
        <Notice id="entry-error" tone="error" title="This entry is temporarily unavailable">
          <p>The transparency service did not answer ({data.error}). Please try again in a moment.</p>
          <p>
            <Link href={ROUTES.log}>Back to the decision log</Link>
          </p>
        </Notice>
      </>
    );
  }

  const { item, isGenesis, linkMatches, headSeq, pageAfter } = data;
  return (
    <>
      <PageHeader aside={<LinkStatusBadge seq={item.seq} isGenesis={isGenesis} linkMatches={linkMatches} />}>
        <BackLink href={ROUTES.logPage(pageAfter)} className="muted">
          Decision log
        </BackLink>
        <h1>Decision #{item.seq}</h1>
      </PageHeader>

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
            <Link href={ROUTES.logEntry(item.seq - 1)} aria-label={`Previous hash, entry ${item.seq - 1}`}>
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

      <Pagination
        label="Neighbouring entries"
        prev={item.seq > 1 ? { href: ROUTES.logEntry(item.seq - 1), label: `← Entry #${item.seq - 1}` } : null}
        next={headSeq !== null && item.seq < headSeq ? { href: ROUTES.logEntry(item.seq + 1), label: `Entry #${item.seq + 1} →` } : null}
      />
    </>
  );
}
