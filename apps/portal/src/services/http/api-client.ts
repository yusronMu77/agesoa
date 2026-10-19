/**
 * API client bound to one backend: base URL, optional Bearer token and fetch implementation are set once, so a
 * service module only lists its endpoints. Every call goes through fetchJson and therefore never throws.
 */

import { type FetchLike, type FetchOptions, type FetchResult, fetchJson } from "./fetch-json";

export interface ApiClientOptions {
  baseUrl: string;
  /** Session token sent as `Authorization: Bearer`; null for public backends. */
  token?: string | null;
  fetchImpl?: FetchLike;
}

export type Query = Record<string, string | number | null | undefined>;

export interface RequestOptions {
  /** Query parameters in insertion order; null and undefined values are left out. */
  query?: Query;
  timeoutMs?: number;
  /** Do not send the session token (public endpoint of a signed-in backend). */
  anonymous?: boolean;
}

export interface ApiClient {
  get<T>(path: string, options?: RequestOptions): Promise<FetchResult<T>>;
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<FetchResult<T>>;
  postForm<T>(path: string, form: FormData, options?: RequestOptions): Promise<FetchResult<T>>;
  put<T>(path: string, body: unknown, options?: RequestOptions): Promise<FetchResult<T>>;
}

/** One path segment, percent-encoded (ids come from URLs and user input). */
export const segment = (value: string) => encodeURIComponent(value);

export function buildUrl(baseUrl: string, path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== null && value !== undefined) params.set(key, String(value));
  }
  const search = params.toString();
  return `${baseUrl}${path}${search ? `?${search}` : ""}`;
}

export function createApiClient({ baseUrl, token, fetchImpl }: ApiClientOptions): ApiClient {
  const request = <T>(path: string, init: FetchOptions, options: RequestOptions = {}) =>
    fetchJson<T>(buildUrl(baseUrl, path, options.query), {
      ...init,
      fetchImpl,
      timeoutMs: options.timeoutMs,
      headers: token && !options.anonymous ? { authorization: `Bearer ${token}` } : undefined,
    });

  return {
    get: (path, options) => request(path, { method: "GET" }, options),
    post: (path, body, options) => request(path, { method: "POST", body }, options),
    postForm: (path, form, options) => request(path, { method: "POST", form }, options),
    put: (path, body, options) => request(path, { method: "PUT", body }, options),
  };
}
