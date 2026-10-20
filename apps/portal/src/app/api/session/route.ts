import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { SESSION_COOKIE, tokenExpiry } from "@/lib/session";
import { sessionCookieOptions } from "@/lib/session-cookie";

/**
 * Stores the ID token from the sign-in page in an httpOnly cookie: until the token expires when the reader ticked
 * "remember this device" (the default), else for the browser session only.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { idToken?: unknown; remember?: unknown } | null;
  const token = typeof body?.idToken === "string" ? body.idToken : "";
  const exp = token.split(".").length === 3 ? tokenExpiry(token) : null;
  if (!exp) return NextResponse.json({ error: "invalid token" }, { status: 400 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    SESSION_COOKIE,
    token,
    sessionCookieOptions({ exp, remember: body?.remember !== false, secure: loadConfig().appEnv !== "local" }),
  );
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
