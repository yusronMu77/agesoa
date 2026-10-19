/**
 * Read-only client for the public read model (Firestore, written only by the transparency service).
 * Uses the Firestore REST API without credentials: the security rules allow anyone to read the public_*
 * collections and nobody to write. The portal never reads a service database.
 */

import { type ApiClient, segment } from "@/services/http/api-client";
import type { FetchResult } from "@/services/http/fetch-json";
import { decodeFields, type FirestoreDocument, type FirestoreListResponse } from "./firestore";
import type { PublicCase, PublicDistrict, PublicFinding, PublicStats } from "./read-model.model";

/** Up to MAX_PAGES × PAGE_SIZE documents per collection. */
const MAX_PAGES = 10;
const PAGE_SIZE = 300;

export function createReadModelService(client: ApiClient) {
  /** Lists a public collection, oldest page first. */
  async function listCollection<T>(collection: string): Promise<FetchResult<T[]>> {
    const items: T[] = [];
    let pageToken: string | undefined;
    let latency = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await client.get<FirestoreListResponse>(`/${collection}`, { query: { pageSize: PAGE_SIZE, pageToken } });
      if (!result.ok) return result;
      latency += result.latencyMs;
      items.push(...(result.data.documents ?? []).map((d) => decodeFields(d.fields ?? {}) as T));
      pageToken = result.data.nextPageToken;
      if (!pageToken) break;
    }
    return { ok: true, status: 200, data: items, latencyMs: latency };
  }

  /** One public document; ok with data null when it does not exist. */
  async function getDocument<T>(path: string): Promise<FetchResult<T | null>> {
    const result = await client.get<FirestoreDocument>(`/${path}`);
    if (!result.ok) {
      if (result.status === 404) return { ok: true, status: 404, data: null, latencyMs: result.latencyMs };
      return result;
    }
    return { ...result, data: decodeFields(result.data.fields ?? {}) as T };
  }

  return {
    listCollection,
    getDocument,
    listCases: () => listCollection<PublicCase>("public_cases"),
    listFindings: () => listCollection<PublicFinding>("public_findings"),
    listDistricts: () => listCollection<PublicDistrict>("public_regions"),
    getCase: (caseId: string) => getDocument<PublicCase>(`public_cases/${segment(caseId)}`),
    getStats: () => getDocument<PublicStats>("public_stats/summary"),
  };
}

export type ReadModelService = ReturnType<typeof createReadModelService>;
