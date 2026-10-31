import { describe, expect, test } from "bun:test";
import { GET as lang } from "@/app/lang/route";
import { POST as logout } from "@/app/logout/route";
import { resolveLogin, safePath, seeOther, signInTarget } from "./redirect";

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
    const res = await logout(new Request(`${INSIDE}/logout`, { method: "POST" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
    expect(res.headers.get("set-cookie")).toContain("agesoa_session=");
  });

  test("sign-out from a console returns to that surface's sign-in page, never off-site", async () => {
    const to = (path: string) => logout(new Request(`${INSIDE}/logout?to=${encodeURIComponent(path)}`, { method: "POST" }));
    expect((await to("/validators/login")).headers.get("location")).toBe("/validators/login");
    expect((await to("/ops/login")).headers.get("location")).toBe("/ops/login");
    expect((await to("//evil.example")).headers.get("location")).toBe("/");
  });

  test("no open redirect", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "", null]) {
      expect(safePath(bad)).toBe("/");
    }
    expect(seeOther("//evil.example").headers.get("location")).toBe("/");
    expect(lang(new Request(`${INSIDE}/lang?to=en&back=https://evil.example`)).headers.get("location")).toBe("/");
  });
});

describe("sign-in targets (next= allow-list)", () => {
  test("each sign-in page only leads into its own surface", () => {
    expect(signInTarget("/validators/findings/F-1", "validator")).toBe("/validators/findings/F-1");
    expect(signInTarget("/organizations", "validator")).toBe("/validators");
    expect(signInTarget("/organizations/ORG-1/deliveries", "institution")).toBe("/organizations/ORG-1/deliveries");
    expect(signInTarget("/validators", "institution")).toBe("/organizations");
    expect(signInTarget("/ops#demo", "ops")).toBe("/ops#demo");
    expect(signInTarget("/validators", "ops")).toBe("/ops");
    expect(signInTarget("/log?after=5", "public")).toBe("/log?after=5");
    expect(signInTarget("/", "public")).toBe("/");
  });

  test("old paths in next= are moved to their current route", () => {
    expect(signInTarget("/validate", "validator")).toBe("/validators");
    expect(signInTarget("/validate/F-1", "validator")).toBe("/validators/findings/F-1");
    expect(signInTarget("/validator/daftar", "validator")).toBe("/validators/register");
    expect(signInTarget("/instansi/ORG-1/riwayat", "institution")).toBe("/organizations/ORG-1/deliveries");
    expect(signInTarget("/dashboard", "public")).toBe("/");
  });

  test("missing or off-site next= falls back to the surface's home", () => {
    for (const bad of [null, undefined, "", "https://evil.example", "//evil.example", "/\\evil.example"]) {
      expect(signInTarget(bad, "validator")).toBe("/validators");
      expect(signInTarget(bad, "institution")).toBe("/organizations");
    }
  });
});

describe("the shared /login page", () => {
  test("console targets go to their own sign-in pages, query kept", () => {
    expect(resolveLogin({ next: "/validate" })).toEqual({ redirect: "/validators/login?next=%2Fvalidators" });
    expect(resolveLogin({ next: "/validate/F-1" })).toEqual({ redirect: "/validators/login?next=%2Fvalidators%2Ffindings%2FF-1" });
    expect(resolveLogin({ next: "/validators/register" })).toEqual({ redirect: "/validators/login?next=%2Fvalidators%2Fregister" });
    expect(resolveLogin({ next: "/organizations", signup: "1" })).toEqual({ redirect: "/organizations/login?next=%2Forganizations&signup=1" });
    expect(resolveLogin({ next: "/organizations/ORG-1" })).toEqual({ redirect: "/organizations/login?next=%2Forganizations%2FORG-1" });
    expect(resolveLogin({ next: "/instansi/ORG-1" })).toEqual({ redirect: "/organizations/login?next=%2Forganizations%2FORG-1" });
    expect(resolveLogin({ next: "/ops" })).toEqual({ redirect: "/ops/login?next=%2Fops" });
    expect(resolveLogin({ next: "/ops", signup: "1" })).toEqual({ redirect: "/ops/login?next=%2Fops&signup=1" });
  });

  test("without next= it is the validator sign-in", () => {
    expect(resolveLogin({})).toEqual({ redirect: "/validators/login" });
    expect(resolveLogin({ lang: "en" })).toEqual({ redirect: "/validators/login?lang=en" });
  });

  test("only the public header sign-in stays on /login", () => {
    expect(resolveLogin({ next: "/dashboard" })).toEqual({ surface: "public", next: "/" });
    expect(resolveLogin({ next: "/" })).toEqual({ surface: "public", next: "/" });
    expect(resolveLogin({ next: "https://evil.example" })).toEqual({ surface: "public", next: "/" });
  });
});
