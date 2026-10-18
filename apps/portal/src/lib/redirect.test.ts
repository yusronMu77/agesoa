import { describe, expect, test } from "bun:test";
import { POST as logout } from "@/app/(auth)/logout/route";
import { safePath, seeOther } from "./redirect";

describe("redirects stay on the reader's host", () => {
  test("sign-out clears the session and goes home with a relative Location (never http://0.0.0.0:8080)", async () => {
    const res = await logout();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
    expect(res.headers.get("set-cookie")).toContain("agesoa_session=");
  });

  test("a same-site path is kept with its query", () => {
    expect(seeOther("/log?page=2").headers.get("location")).toBe("/log?page=2");
  });

  test("no open redirect", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "", null, undefined]) {
      expect(safePath(bad)).toBe("/");
    }
  });
});
