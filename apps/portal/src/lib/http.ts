/** Small JSON-over-HTTP helper for server-side calls to the backend services. */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const DEFAULT_TIMEOUT_MS = 3000;

export type FetchResult<T> =
  | { ok: true; status: number; data: T; latencyMs: number }
  | {
      ok: false;
      /** HTTP status when the service answered, null when it could not be reached. */
      status: number | null;
      /** Parsed JSON body of an error response, if any. */
      body: unknown;
      error: string;
      latencyMs: number;
    };

export interface FetchOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  /** Extra request headers (e.g. Authorization for signed-in pages). */
  headers?: Record<string, string>;
  method?: "GET" | "POST" | "PUT";
  /** JSON request body (POST/PUT). */
  body?: unknown;
  /** Multipart request body (POST with a file); exclusive with `body`. */
  form?: FormData;
}

function describeError(error: unknown, timeoutMs: number): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") return `timeout after ${timeoutMs} ms`;
    return "unreachable";
  }
  return "unreachable";
}

/**
 * Requests a URL (GET by default) and parses the JSON body. Never throws: network errors, timeouts,
 * non-2xx answers and invalid JSON are returned as { ok: false }.
 */
export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<FetchResult<T>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
        ...options.headers,
      },
      body: options.form ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return { ok: false, status: null, body: null, error: describeError(error, timeoutMs), latencyMs: elapsed() };
  }

  let body: unknown = null;
  let parsed = false;
  try {
    body = await response.json();
    parsed = true;
  } catch {
    // Not JSON (or the body timed out); handled below.
  }

  if (!response.ok) {
    return { ok: false, status: response.status, body, error: `HTTP ${response.status}`, latencyMs: elapsed() };
  }
  if (!parsed) {
    return { ok: false, status: response.status, body: null, error: "invalid JSON response", latencyMs: elapsed() };
  }
  return { ok: true, status: response.status, data: body as T, latencyMs: elapsed() };
}
