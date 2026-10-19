/** Public decision log of the transparency service (the only writer of the hash chain). */

export interface LogEntry {
  seq: number;
  event_id: string;
  decision_id: string;
  source_service: string;
  action: string;
  subject_kind: string;
  subject_id: string;
  entry: unknown;
  prev_hash: string;
  hash: string;
  recorded_at: string;
}

export interface LogPage {
  items: LogEntry[];
  next_after: number | null;
}

export interface LogHead {
  seq: number;
  hash: string;
  updated_at: string;
}

export interface LogVerification {
  ok: boolean;
  length: number;
  head_hash: string | null;
  first_invalid_seq: number | null;
  reason: string | null;
}

/** prev_hash of the first entry. */
export const GENESIS_HASH = "0".repeat(64);

/** Page size used by the portal; the service accepts up to 200. */
export const LOG_PAGE_SIZE = 50;
