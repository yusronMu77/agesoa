/** Read-only client for the public decision log served by the transparency service. */

import type { ApiClient } from "@/services/http/api-client";
import type { FetchResult } from "@/services/http/fetch-json";
import { LOG_PAGE_SIZE, type LogEntry, type LogHead, type LogPage, type LogVerification } from "./transparency.model";

/** Upper bound for one subject: 20 pages of 200 entries. */
const SUBJECT_MAX_PAGES = 20;

export function createTransparencyService(client: ApiClient) {
  return {
    getLogPage(params: { after?: number; limit?: number } = {}): Promise<FetchResult<LogPage>> {
      const after = params.after !== undefined && params.after > 0 ? params.after : undefined;
      return client.get<LogPage>("/v1/log", { query: { limit: params.limit ?? LOG_PAGE_SIZE, after } });
    },

    getLogHead: () => client.get<LogHead>("/v1/log/head"),

    verifyLog: () => client.get<LogVerification>("/v1/log/verify"),

    getLogEntry: (seq: number) => client.get<LogEntry>(`/v1/log/${seq}`),

    /** Every log entry about one subject (e.g. a case or a finding), oldest first. */
    async getLogForSubject(subjectKind: string, subjectId: string): Promise<FetchResult<LogEntry[]>> {
      const items: LogEntry[] = [];
      let after = 0;
      let latency = 0;
      for (let page = 0; page < SUBJECT_MAX_PAGES; page++) {
        const result = await client.get<LogPage>("/v1/log", {
          query: { subject_kind: subjectKind, subject_id: subjectId, limit: 200, after: after > 0 ? after : undefined },
        });
        if (!result.ok) return result;
        latency += result.latencyMs;
        items.push(...result.data.items);
        if (result.data.next_after === null) break;
        after = result.data.next_after;
      }
      return { ok: true, status: 200, data: items, latencyMs: latency };
    },
  };
}

export type TransparencyService = ReturnType<typeof createTransparencyService>;
