/** Props of App Router pages (Next.js 16 passes params and searchParams as promises) and their parsing. */

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export interface PageProps<P extends Record<string, string> = Record<string, never>> {
  params: Promise<P>;
  searchParams: SearchParams;
}

/** A route segment as the user typed it (Next.js leaves it percent-encoded). */
export async function routeParam<P extends Record<string, string>>(params: Promise<P>, key: keyof P): Promise<string> {
  return decodeURIComponent((await params)[key]);
}

/** A query parameter when it is given exactly once; repeated or missing → undefined. */
export function stringParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Parses a non-negative integer from a query/route parameter; undefined when invalid. */
export function parseSeq(raw: string | string[] | undefined): number | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || !/^\d{1,15}$/.test(value)) return undefined;
  return Number(value);
}
