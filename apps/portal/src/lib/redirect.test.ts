import { describe, expect, test } from "bun:test";
import { GET as lang } from "@/app/lang/route";
import { POST as logout } from "@/app/logout/route";
import { safePath, seeOther } from "./redirect";

// The container serves on 0.0.0.0:8080; the browser must never be sent there.
const INSIDE = "http://0.0.0.0:8080";

describe("redirects stay on the reader's host", () => {
  test("the language picker returns to the page with a relative Location and remembers the choice", () => {
    const res = lang(new Request(`${INSIDE}/lang?to=en&back=${encodeURIComponent("/log?page=2")}`));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/log?page=2");
    expect(res.headers.get("set-cookie")).toContain("agesoa_lang=en");
  });

  test("an unknown language changes nothing but still goes back", () => {
    const res = lang(new Request(`${INSIDE}/lang?to=fr&back=/dashboard`));
    expect(res.headers.get("location")).toBe("/dashboard");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  test("sign-out clears the session and goes home with a relative Location", async () => {
    const res = await logout();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
    expect(res.headers.get("set-cookie")).toContain("agesoa_session=");
  });

  test("no open redirect", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "", null]) {
      expect(safePath(bad)).toBe("/");
    }
    expect(seeOther("//evil.example").headers.get("location")).toBe("/");
    expect(lang(new Request(`${INSIDE}/lang?to=en&back=https://evil.example`)).headers.get("location")).toBe("/");
  });
});
