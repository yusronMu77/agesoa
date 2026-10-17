import { Badge } from "@/components/ui/badge";
import { shortHash } from "@/lib/format";
import type { FetchResult } from "@/services/http/fetch-json";
import type { LogVerification } from "@/services/transparency/transparency.model";

/** Result of recomputing the whole hash chain. */
export function ChainBadge({ result }: { result: FetchResult<LogVerification> }) {
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

/** Whether an entry's prev_hash matches the hash of the entry before it. */
export function LinkStatusBadge({ seq, isGenesis, linkMatches }: { seq: number; isGenesis: boolean; linkMatches: boolean | null }) {
  if (isGenesis) {
    return (
      <Badge tone="ok" testId="link-status">
        First entry (genesis)
      </Badge>
    );
  }
  if (linkMatches === true) {
    return (
      <Badge tone="ok" testId="link-status">
        Linked to entry #{seq - 1}
      </Badge>
    );
  }
  if (linkMatches === false) {
    return (
      <Badge tone="error" testId="link-status">
        Previous hash does not match entry #{seq - 1}
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" testId="link-status">
      Link to previous entry not checked
    </Badge>
  );
}
