import { describe, expect, test } from "bun:test";
import { canonicalPath, LEGACY_REDIRECTS, ROUTES, signInHref, surfaceOf } from "./routes";

describe("legacy paths move to the current routes", () => {
  test.each([
    ["/dashboard", "/"],
    ["/dashboard?page=2&status=alleged", "/?page=2&status=alleged"],
    ["/findings/F-1", "/temuan/F-1"],
    ["/cases/CASE-1", "/temuan/CASE-1"],
    ["/cases/CASE-1?verify=1#case-log", "/temuan/CASE-1?verify=1#case-log"],
    ["/cases/CASE-1/report", "/temuan/CASE-1/laporan"],
    ["/validate", "/validator"],
    ["/validate?filter=decided", "/validator?filter=decided"],
    ["/validate/F-1", "/validator/temuan/F-1"],
    ["/validators/register", "/validator/daftar"],
    ["/validators/register?step=review", "/validator/daftar?step=review"],
    ["/organizations", "/instansi"],
    ["/organizations/ORG-1", "/instansi/ORG-1"],
    ["/organizations/ORG-1/deliveries", "/instansi/ORG-1/riwayat"],
    ["/organizations/ORG%201/", "/instansi/ORG%201"],
  ])("%s → %s", (from, to) => {
    expect(canonicalPath(from)).toBe(to);
  });

  test("current and unrelated paths are unchanged", () => {
    for (const path of ["/", "/log", "/log/12", "/about", "/status", "/ops", "/ops#demo", "/validator", "/temuan/C-1/laporan", "/cases"]) {
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
    expect(ROUTES.case("C 1/2")).toBe("/temuan/C%201%2F2");
    expect(ROUTES.caseReport("C-1")).toBe("/temuan/C-1/laporan");
    expect(ROUTES.validatorFinding("F-1")).toBe("/validator/temuan/F-1");
    expect(ROUTES.organizationHistory("ORG-1")).toBe("/instansi/ORG-1/riwayat");
  });
});

describe("surfaces and their sign-in pages", () => {
  test("each path belongs to one surface", () => {
    expect(surfaceOf("/validator/daftar")).toBe("validator");
    expect(surfaceOf("/validator?filter=decided")).toBe("validator");
    expect(surfaceOf("/instansi/ORG-1")).toBe("institution");
    expect(surfaceOf("/ops")).toBe("ops");
    expect(surfaceOf("/temuan/C-1")).toBe("public");
    expect(surfaceOf("/validatorx")).toBe("public");
  });

  test("the decision log has a page inside each console, so reading it keeps the console (and its session view)", () => {
    expect(ROUTES.validatorLog).toBe("/validator/log");
    expect(ROUTES.institutionLog).toBe("/instansi/log");
    expect(surfaceOf(ROUTES.validatorLog)).toBe("validator");
    expect(surfaceOf(`${ROUTES.institutionLog}/12`)).toBe("institution");
    expect(surfaceOf(ROUTES.log)).toBe("public");
    expect(signInHref(ROUTES.validatorLog)).toBe("/validator/masuk?next=%2Fvalidator%2Flog");
  });

  test("signInHref picks the surface's sign-in page and keeps next", () => {
    expect(signInHref("/validator")).toBe("/validator/masuk?next=%2Fvalidator");
    expect(signInHref("/validator/temuan/F-1")).toBe("/validator/masuk?next=%2Fvalidator%2Ftemuan%2FF-1");
    expect(signInHref("/instansi/ORG-1")).toBe("/instansi/masuk?next=%2Finstansi%2FORG-1");
    expect(signInHref("/ops")).toBe("/login?next=%2Fops");
    expect(signInHref("/validate/F-1")).toBe("/validator/masuk?next=%2Fvalidator%2Ftemuan%2FF-1");
  });
});
