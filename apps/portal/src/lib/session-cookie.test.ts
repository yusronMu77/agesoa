import { describe, expect, test } from "bun:test";
import { sessionCookieOptions } from "./session-cookie";

describe("session cookie", () => {
  const now = 1_800_000_000_000;
  test("remember this device keeps the cookie until the token expires", () => {
    const options = sessionCookieOptions({ exp: now / 1000 + 3600, remember: true, secure: true, now });
    expect(options.maxAge).toBe(3600);
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true, path: "/" });
  });

  test("without it the cookie lasts for the browser session only", () => {
    const options = sessionCookieOptions({ exp: now / 1000 + 3600, remember: false, secure: false, now });
    expect("maxAge" in options).toBe(false);
    expect(options.secure).toBe(false);
  });

  test("an expired token never gets a negative lifetime", () => {
    expect(sessionCookieOptions({ exp: now / 1000 - 10, remember: true, secure: true, now }).maxAge).toBe(0);
  });
});
