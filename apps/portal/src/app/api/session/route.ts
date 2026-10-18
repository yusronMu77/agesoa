import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { SESSION_COOKIE, tokenExpiry } from "@/lib/session";

/** Stores the ID token from the sign-in page in an httpOnly cookie (expires with the token). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { idToken?: unknown } | null;
  const token = typeof body?.idToken === "string" ? body.idToken : "";
  const exp = token.split(".").length === 3 ? tokenExpiry(token) : null;
  if (!exp) return NextResponse.json({ error: "invalid token" }, { status: 400 });
  const maxAge = Math.max(0, exp - Math.floor(Date.now() / 1000));
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: loadConfig().appEnv !== "local",
    path: "/",
    maxAge,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
