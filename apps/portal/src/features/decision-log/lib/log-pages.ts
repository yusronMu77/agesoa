/** Pagination of the decision log by `?after=<seq>` (entries after that sequence number). */

import { LOG_PAGE_SIZE } from "@/services/transparency/transparency.model";

/** `after` of the page before this one; null on the first page. */
export function previousAfter(after: number, pageSize = LOG_PAGE_SIZE): number | null {
  return after > 0 ? Math.max(0, after - pageSize) : null;
}

/** Whether a next page exists: the service gave a cursor and it is before the head of the log. */
export function hasNextPage(nextAfter: number | null, headSeq: number | null): nextAfter is number {
  return nextAfter !== null && (headSeq === null || nextAfter < headSeq);
}

/** `after` of the page that shows entry `seq` (to link back from an entry to its page). */
export function pageAfterOf(seq: number, pageSize = LOG_PAGE_SIZE): number {
  return Math.floor((seq - 1) / pageSize) * pageSize;
}
