/**
 * Display names of domain packs and their categories, read from the ingestion API (`GET /v1/domain-packs/{id}`). The
 * public dashboard shows them as its "issue type" context; nothing about a domain is hard-coded in the portal.
 */

import type { PortalConfig } from "./config";
import { type FetchOptions, type FetchResult, fetchJson } from "./http";

export type LocalizedText = Partial<Record<string, string>>;

export interface DomainPackSummary {
  id: string;
  version?: string;
  name: LocalizedText;
  /** Category ids (list endpoint) or `{id, label}` objects (pack document). */
  categories?: (string | { id: string; label?: LocalizedText })[];
}

export function getDomainPack(
  config: PortalConfig,
  id: string,
  options?: FetchOptions,
): Promise<FetchResult<DomainPackSummary>> {
  return fetchJson<DomainPackSummary>(`${config.serviceUrls.ingestion}/v1/domain-packs/${encodeURIComponent(id)}`, {
    timeoutMs: 1500,
    ...options,
  });
}

/** Text in `lang`, else English, else Indonesian, else the first value; null when there is none. */
export function localized(text: LocalizedText | null | undefined, lang: string): string | null {
  if (!text) return null;
  return text[lang] ?? text.en ?? text.id ?? Object.values(text).find((v): v is string => Boolean(v)) ?? null;
}

/** Name of a pack in `lang`, falling back to its id when the pack is unknown. */
export function packName(packs: DomainPackSummary[], id: string, lang: string): string {
  return localized(packs.find((p) => p.id === id)?.name, lang) ?? id;
}

/** Label of a category in `lang` (from a pack document), falling back to the category id. */
export function categoryLabel(packs: DomainPackSummary[], category: string, lang: string): string {
  for (const pack of packs) {
    for (const c of pack.categories ?? []) {
      if (typeof c !== "string" && c.id === category) return localized(c.label, lang) ?? category;
    }
  }
  return category;
}

/**
 * Pack documents (with category labels) of the given domain ids. A pack the service does not answer for is simply
 * missing: callers fall back to ids, so the dashboard never fails because ingestion is down.
 */
export async function loadDomainPacks(config: PortalConfig, ids: string[], options?: FetchOptions): Promise<DomainPackSummary[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  const results = await Promise.all(unique.map((id) => getDomainPack(config, id, options)));
  return results.flatMap((r) => (r.ok ? [r.data] : []));
}
