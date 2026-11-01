/**
 * Validator session: the Firebase ID token from the sign-in page is kept in an httpOnly cookie and sent as
 * `Authorization: Bearer` to trust and case-audit, which verify it (signature, audience, role claim). The portal
 * only reads the expiry to decide when to ask for a new sign-in; it never trusts the token's claims itself.
 */

import { cookies } from "next/headers";
import { claimedRoles, type ConsoleRole } from "./role-switch";

export const SESSION_COOKIE = "agesoa_session";

/** The token's claims, decoded without verifying the signature; null when the token is not a JWT. */
export function tokenPayload(token: string): Record<string, unknown> | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const json: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    return json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function tokenExpiry(token: string): number | null {
  const exp = tokenPayload(token)?.exp;
  return typeof exp === "number" ? exp : null;
}

/** The session token when present and not expired; null otherwise. */
export async function sessionToken(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const exp = tokenExpiry(token);
  return exp !== null && exp * 1000 > Date.now() + 30_000 ? token : null;
}

/**
 * The console roles of the signed-in session, to choose links only (the role switcher offers "Open dashboard", a
 * console sign-in page goes straight to its console). Every console call still sends the token to the services,
 * which verify it.
 */
export async function sessionRoles(): Promise<ConsoleRole[]> {
  const token = await sessionToken();
  return token ? claimedRoles(tokenPayload(token)) : [];
}
