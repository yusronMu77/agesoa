import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/ui/callout";
import { Pagination } from "@/components/ui/pagination";
import { ROUTES } from "@/configs/routes.config";
import { LOG_PAGE_SIZE } from "@/services/transparency/transparency.model";
import { ChainBadge } from "../components/chain-badge";
import { LogTable } from "../components/log-table";
import type { LogPageData } from "../server/load-log";

/** SCR-042: public, append-only decision log. */
export function LogListView({ after, page, verification, headSeq, nextAfter, prevAfter }: LogPageData) {
  return (
    <>
      <PageHeader aside={<ChainBadge result={verification} />}>
        <h1>Decision log</h1>
        <p className="muted">
          Public, append-only record of decisions. Each entry stores the hash of the entry before it, so any
          change to history breaks the chain.
        </p>
      </PageHeader>

      {!page.ok ? (
        <Notice id="log-error" tone="error" title="The decision log is temporarily unavailable">
          <p>The transparency service did not answer ({page.error}). Please try again in a moment.</p>
        </Notice>
      ) : page.data.items.length === 0 ? (
        <Notice id="log-empty" title={after > 0 ? "No more entries" : "No decisions recorded yet"}>
          <p>{after > 0 ? <Link href={ROUTES.log}>Back to the first page</Link> : "Decisions appear here as soon as they are recorded."}</p>
        </Notice>
      ) : (
        <>
          <LogTable items={page.data.items} headSeq={headSeq} />
          <Pagination
            label="Log pages"
            prev={prevAfter !== null ? { href: ROUTES.logPage(prevAfter), label: `← Previous ${LOG_PAGE_SIZE}` } : null}
            next={nextAfter !== null ? { href: ROUTES.logPage(nextAfter), label: `Next ${LOG_PAGE_SIZE} →` } : null}
          />
        </>
      )}
    </>
  );
}
