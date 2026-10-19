import Link from "next/link";
import { TableWrap } from "@/components/ui/table-wrap";
import { ROUTES } from "@/configs/routes.config";
import { formatTime, shortHash } from "@/lib/format";
import type { LogEntry } from "@/services/transparency/transparency.model";

/** One page of the public log, oldest first. */
export function LogTable({ items, headSeq }: { items: LogEntry[]; headSeq: number | null }) {
  return (
    <TableWrap labelledBy="log-caption">
      <table data-testid="log-table">
        <caption id="log-caption">
          Entries {items[0].seq}–{items[items.length - 1].seq}
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
          {items.map((item) => (
            <tr key={item.seq}>
              <td className="num">
                <Link href={ROUTES.logEntry(item.seq)} aria-label={`Entry ${item.seq}`}>
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
    </TableWrap>
  );
}
