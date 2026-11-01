import { describe, expect, test } from "bun:test";
import { tokenExpiry, tokenPayload } from "@/lib/session";

const jwt = (claims: unknown) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;

describe("session token", () => {
  test("decodes the claims of a JWT, null for anything else", () => {
    expect(tokenPayload(jwt({ exp: 1, validator: true }))).toEqual({ exp: 1, validator: true });
    expect(tokenPayload("not-a-jwt")).toBeNull();
    expect(tokenPayload("h.!!!.s")).toBeNull();
    expect(tokenPayload(jwt("text"))).toBeNull();
  });

  test("reads the expiry, null when missing or not a number", () => {
    expect(tokenExpiry(jwt({ exp: 1_800_000_000 }))).toBe(1_800_000_000);
    expect(tokenExpiry(jwt({ exp: "soon" }))).toBeNull();
    expect(tokenExpiry("not-a-jwt")).toBeNull();
  });
});
