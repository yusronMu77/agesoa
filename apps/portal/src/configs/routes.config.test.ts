import { describe, expect, test } from "bun:test";
import { ROUTES, safeNextPath, withQuery } from "./routes.config";

describe("routes", () => {
  test("encodes ids as one path segment", () => {
    expect(ROUTES.case("K 1/2")).toBe("/cases/K%201%2F2");
    expect(ROUTES.organization("ORG-1")).toBe("/organizations/ORG-1");
    expect(ROUTES.logPage(0)).toBe("/log");
    expect(ROUTES.logPage(50)).toBe("/log?after=50");
  });

  test("keeps the sign-in target readable", () => {
    expect(ROUTES.login(ROUTES.validateFinding("F-1"))).toBe("/login?next=/validate/F-1");
    expect(ROUTES.login()).toBe("/login");
  });

  test("builds query strings with encoded values", () => {
    expect(withQuery("/ops", { reset: "failed", seconds: 1.5, error: "trust: HTTP 403" })).toBe(
      "/ops?reset=failed&seconds=1.5&error=trust%3A%20HTTP%20403",
    );
    expect(withQuery("/validate", { done: undefined })).toBe("/validate");
  });

  test("accepts only internal paths after sign-in", () => {
    expect(safeNextPath("/organizations")).toBe("/organizations");
    expect(safeNextPath("//evil.example")).toBe("/validate");
    expect(safeNextPath("https://evil.example")).toBe("/validate");
    expect(safeNextPath(["/ops"])).toBe("/validate");
  });
});
