import { notFound } from "next/navigation";
import { loadConfig } from "@/configs/env.config";
import { createBackend } from "@/services/backend";
import { GENESIS_HASH, LOG_PAGE_SIZE } from "@/services/transparency/transparency.model";
import { hasNextPage, pageAfterOf, previousAfter } from "../lib/log-pages";

/** SCR-042 list: one page of entries, the chain verification and the head (for "of N" and the next link). */
export async function loadLogPage(after: number) {
  const { transparency } = createBackend(loadConfig());
  const [page, verification, head] = await Promise.all([
    transparency.getLogPage({ after, limit: LOG_PAGE_SIZE }),
    transparency.verifyLog(),
    transparency.getLogHead(),
  ]);
  const headSeq = head.ok ? head.data.seq : null;
  const nextAfter = page.ok ? page.data.next_after : null;
  return {
    after,
    page,
    verification,
    headSeq,
    nextAfter: hasNextPage(nextAfter, headSeq) ? nextAfter : null,
    prevAfter: previousAfter(after),
  };
}

export type LogPageData = Awaited<ReturnType<typeof loadLogPage>>;

/** SCR-042 entry: the entry, its predecessor (to check the link) and the head (for the next link). */
export async function loadLogEntry(seq: number) {
  const { transparency } = createBackend(loadConfig());
  const [entry, previous, head] = await Promise.all([
    transparency.getLogEntry(seq),
    seq > 1 ? transparency.getLogEntry(seq - 1) : Promise.resolve(null),
    transparency.getLogHead(),
  ]);
  if (!entry.ok && entry.status === 404) notFound();
  if (!entry.ok) return { seq, ok: false as const, error: entry.error };

  const item = entry.data;
  return {
    seq,
    ok: true as const,
    item,
    isGenesis: item.seq === 1 && item.prev_hash === GENESIS_HASH,
    linkMatches: previous?.ok ? previous.data.hash === item.prev_hash : null,
    headSeq: head.ok ? head.data.seq : null,
    pageAfter: pageAfterOf(item.seq),
  };
}

export type LogEntryData = Awaited<ReturnType<typeof loadLogEntry>>;
