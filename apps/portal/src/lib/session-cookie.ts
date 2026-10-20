/**
 * Cookie options of the portal session (the Firebase ID token). "Ingat perangkat ini" (remember this device) keeps the
 * cookie until the token expires; without it the cookie is a browser-session cookie, gone when the browser closes.
 */
export function sessionCookieOptions({
  exp,
  remember,
  secure,
  now = Date.now(),
}: {
  /** Token expiry, seconds since the epoch. */
  exp: number;
  remember: boolean;
  secure: boolean;
  now?: number;
}): { httpOnly: true; sameSite: "lax"; secure: boolean; path: "/"; maxAge?: number } {
  const base = { httpOnly: true, sameSite: "lax", secure, path: "/" } as const;
  return remember ? { ...base, maxAge: Math.max(0, exp - Math.floor(now / 1000)) } : { ...base };
}
