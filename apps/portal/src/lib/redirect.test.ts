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
    expect((await to("/validator/masuk")).headers.get("location")).toBe("/validator/masuk");
    expect((await to("/login?next=/ops")).headers.get("location")).toBe("/login?next=/ops");
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
    expect(signInTarget("/validator/temuan/F-1", "validator")).toBe("/validator/temuan/F-1");
    expect(signInTarget("/instansi", "validator")).toBe("/validator");
    expect(signInTarget("/instansi/ORG-1/riwayat", "institution")).toBe("/instansi/ORG-1/riwayat");
    expect(signInTarget("/validator", "institution")).toBe("/instansi");
    expect(signInTarget("/ops#demo", "ops")).toBe("/ops#demo");
    expect(signInTarget("/log?after=5", "public")).toBe("/log?after=5");
    expect(signInTarget("/", "public")).toBe("/");
  });

  test("old paths in next= are moved to their current route", () => {
    expect(signInTarget("/validate", "validator")).toBe("/validator");
    expect(signInTarget("/validate/F-1", "validator")).toBe("/validator/temuan/F-1");
    expect(signInTarget("/validators/register", "validator")).toBe("/validator/daftar");
    expect(signInTarget("/organizations/ORG-1/deliveries", "institution")).toBe("/instansi/ORG-1/riwayat");
    expect(signInTarget("/dashboard", "public")).toBe("/");
  });

  test("missing or off-site next= falls back to the surface's home", () => {
    for (const bad of [null, undefined, "", "https://evil.example", "//evil.example", "/\\evil.example"]) {
      expect(signInTarget(bad, "validator")).toBe("/validator");
      expect(signInTarget(bad, "institution")).toBe("/instansi");
    }
  });
});

describe("the shared /login page", () => {
  test("validator and institution targets go to their own sign-in pages, query kept", () => {
    expect(resolveLogin({ next: "/validate" })).toEqual({ redirect: "/validator/masuk?next=%2Fvalidator" });
    expect(resolveLogin({ next: "/validate/F-1" })).toEqual({ redirect: "/validator/masuk?next=%2Fvalidator%2Ftemuan%2FF-1" });
    expect(resolveLogin({ next: "/validators/register" })).toEqual({ redirect: "/validator/masuk?next=%2Fvalidator%2Fdaftar" });
    expect(resolveLogin({ next: "/organizations", signup: "1" })).toEqual({ redirect: "/instansi/masuk?next=%2Finstansi&signup=1" });
    expect(resolveLogin({ next: "/organizations/ORG-1" })).toEqual({ redirect: "/instansi/masuk?next=%2Finstansi%2FORG-1" });
    expect(resolveLogin({ next: "/instansi/ORG-1" })).toEqual({ redirect: "/instansi/masuk?next=%2Finstansi%2FORG-1" });
  });

  test("without next= it is the validator sign-in", () => {
    expect(resolveLogin({})).toEqual({ redirect: "/validator/masuk" });
    expect(resolveLogin({ lang: "en" })).toEqual({ redirect: "/validator/masuk?lang=en" });
  });

  test("the operator and the public header sign-in stay on /login", () => {
    expect(resolveLogin({ next: "/ops" })).toEqual({ surface: "ops", next: "/ops" });
    expect(resolveLogin({ next: "/dashboard" })).toEqual({ surface: "public", next: "/" });
    expect(resolveLogin({ next: "/" })).toEqual({ surface: "public", next: "/" });
    expect(resolveLogin({ next: "https://evil.example" })).toEqual({ surface: "public", next: "/" });
  });
});
