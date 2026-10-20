/**
 * Validator session: the Firebase ID token from the sign-in page is kept in an httpOnly cookie and sent as
 * `Authorization: Bearer` to trust and case-audit, which verify it (signature, audience, role claim). The portal
 * only reads the expiry to decide when to ask for a new sign-in; it never trusts the token's claims itself.
 */

import { cookies } from "next/headers";

export const SESSION_COOKIE = "agesoa_session";

export function tokenExpiry(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as { exp?: number };
    return typeof json.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}

/** The session token when present and not expired; null otherwise. */
export async function sessionToken(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const exp = tokenExpiry(token);
  return exp !== null && exp * 1000 > Date.now() + 30_000 ? token : null;
}
