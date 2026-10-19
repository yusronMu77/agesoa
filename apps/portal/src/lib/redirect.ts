import { NextResponse } from "next/server";

/**
 * 303 See Other to a same-site path, with a RELATIVE Location. In the container the request URL is the server's own
 * bind address (http://0.0.0.0:8080), so an absolute URL built from `request.url` sends the browser to an address it
 * cannot reach; a relative Location keeps whatever host the reader used (localhost, a node IP, the Cloud Run domain).
 */
export function seeOther(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: safePath(path) } });
}

/** Only same-site paths: never an open redirect (`//host`, `/\host` and absolute URLs fall back to `/`). */
export function safePath(path: string | null | undefined): string {
  return path?.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/";
}
