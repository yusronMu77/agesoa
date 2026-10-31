import { describe, expect, test } from "bun:test";
import { canonicalPath, LEGACY_REDIRECTS, ROUTES, signInHref, surfaceOf } from "./routes";

describe("legacy paths move to the current routes", () => {
  test.each([
    // first English routes (before the surface split)
    ["/dashboard", "/"],
    ["/dashboard?page=2&status=alleged", "/?page=2&status=alleged"],
    ["/findings/F-1", "/cases/F-1"],
    ["/validate", "/validators"],
    ["/validate?filter=decided", "/validators?filter=decided"],
    ["/validate/F-1", "/validators/findings/F-1"],
    // Indonesian routes of the surface split (#157)
    ["/temuan/CASE-1", "/cases/CASE-1"],
    ["/temuan/CASE-1?verify=1#case-log", "/cases/CASE-1?verify=1#case-log"],
    ["/temuan/CASE-1/laporan", "/cases/CASE-1/report"],
    ["/validator", "/validators"],
    ["/validator?filter=decided", "/validators?filter=decided"],
    ["/validator/masuk?next=%2Fvalidator", "/validators/login?next=%2Fvalidator"],
    ["/validator/daftar?step=review", "/validators/register?step=review"],
    ["/validator/temuan/F-1", "/validators/findings/F-1"],
    ["/validator/log", "/validators/log"],
    ["/validator/log/12", "/validators/log/12"],
    ["/instansi", "/organizations"],
    ["/instansi?daftar=1", "/organizations?daftar=1"],
    ["/instansi/masuk?signup=1", "/organizations/login?signup=1"],
    ["/instansi/log", "/organizations/log"],
    ["/instansi/log/7", "/organizations/log/7"],
    ["/instansi/ORG-1", "/organizations/ORG-1"],
    ["/instansi/ORG-1/riwayat", "/organizations/ORG-1/deliveries"],
    ["/instansi/ORG%201/", "/organizations/ORG%201"],
    ["/lokasi?to=&back=%2F", "/location?to=&back=%2F"],
  ])("%s → %s", (from, to) => {
    expect(canonicalPath(from)).toBe(to);
  });

  test("current and unrelated paths are unchanged", () => {
    for (const path of [
      "/",
      "/log",
      "/log/12",
      "/about",
      "/status",
      "/ops",
      "/ops#demo",
      "/cases",
      "/cases/C-1/report",
      "/validators",
      "/validators/login",
      "/validators/register",
      "/validators/findings/F-1",
      "/organizations",
      "/organizations/login",
      "/organizations/ORG-1/deliveries",
      "/location",
    ]) {
      expect(canonicalPath(path)).toBe(path);
    }
  });

  test("every redirect destination is a current route (no chains, no loops)", () => {
    for (const { destination } of LEGACY_REDIRECTS) {
      const sample = destination.replace(/:(\w+)/g, "X");
      expect(canonicalPath(sample)).toBe(sample);
    }
  });

  test("route builders encode ids", () => {
    expect(ROUTES.case("C 1/2")).toBe("/cases/C%201%2F2");
    expect(ROUTES.caseReport("C-1")).toBe("/cases/C-1/report");
    expect(ROUTES.validatorFinding("F-1")).toBe("/validators/findings/F-1");
    expect(ROUTES.organization("ORG 1")).toBe("/organizations/ORG%201");
    expect(ROUTES.organizationHistory("ORG-1")).toBe("/organizations/ORG-1/deliveries");
    expect(ROUTES.logEntry(12)).toBe("/log/12");
  });

  test("every canonical route uses English segments only", () => {
    const paths = Object.values(ROUTES).map((r) => (typeof r === "function" ? r("X") : r));
    for (const path of paths) {
      expect(path).not.toMatch(/\/(temuan|laporan|validator\/|instansi|masuk|daftar|riwayat|lokasi)\b/);
    }
  });
});

describe("surfaces and their sign-in pages", () => {
  test("each path belongs to one surface", () => {
    expect(surfaceOf("/validators/register")).toBe("validator");
    expect(surfaceOf("/validators?filter=decided")).toBe("validator");
    expect(surfaceOf("/organizations/ORG-1")).toBe("institution");
    expect(surfaceOf("/ops")).toBe("ops");
    expect(surfaceOf("/cases/C-1")).toBe("public");
    expect(surfaceOf("/validatorsx")).toBe("public");
  });

  test("the decision log has a page inside each console, so reading it keeps the console (and its session view)", () => {
    expect(ROUTES.validatorLog).toBe("/validators/log");
    expect(ROUTES.institutionLog).toBe("/organizations/log");
    expect(surfaceOf(ROUTES.validatorLog)).toBe("validator");
    expect(surfaceOf(`${ROUTES.institutionLog}/12`)).toBe("institution");
    expect(surfaceOf(ROUTES.log)).toBe("public");
    expect(signInHref(ROUTES.validatorLog)).toBe("/validators/login?next=%2Fvalidators%2Flog");
  });

  test("signInHref picks the surface's sign-in page and keeps next", () => {
    expect(signInHref("/validators")).toBe("/validators/login?next=%2Fvalidators");
    expect(signInHref("/validators/findings/F-1")).toBe("/validators/login?next=%2Fvalidators%2Ffindings%2FF-1");
    expect(signInHref("/organizations/ORG-1")).toBe("/organizations/login?next=%2Forganizations%2FORG-1");
    expect(signInHref("/ops")).toBe("/login?next=%2Fops");
    // old links in next= are moved first
    expect(signInHref("/validate/F-1")).toBe("/validators/login?next=%2Fvalidators%2Ffindings%2FF-1");
    expect(signInHref("/instansi/ORG-1/riwayat")).toBe("/organizations/login?next=%2Forganizations%2FORG-1%2Fdeliveries");
  });
});
