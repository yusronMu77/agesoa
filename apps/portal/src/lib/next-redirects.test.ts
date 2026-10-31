import { describe, expect, test } from "bun:test";
import { getRedirectUrl, unstable_getResponseFromNextConfig } from "next/experimental/testing/server";
import nextConfig from "../../next.config";

// The real Next.js matcher over next.config.ts redirects(): permanent 308, query strings kept, relative Location.
async function hit(path: string) {
  return unstable_getResponseFromNextConfig({ url: `http://0.0.0.0:8080${path}`, nextConfig });
}

describe("next.config legacy redirects", () => {
  test.each([
    ["/dashboard?page=2", "/?page=2"],
    ["/findings/F-1", "/cases/F-1"],
    ["/validate?filter=decided", "/validators?filter=decided"],
    ["/validate/F-1", "/validators/findings/F-1"],
    ["/temuan/CASE-1?verify=1", "/cases/CASE-1?verify=1"],
    ["/temuan/CASE-1/laporan", "/cases/CASE-1/report"],
    ["/validator?filter=decided", "/validators?filter=decided"],
    ["/validator/masuk?next=%2Fvalidator&lang=en", "/validators/login?next=%2Fvalidator&lang=en"],
    ["/validator/daftar", "/validators/register"],
    ["/validator/temuan/F-1", "/validators/findings/F-1"],
    ["/validator/log/4", "/validators/log/4"],
    ["/instansi?kind=agency", "/organizations?kind=agency"],
    ["/instansi/masuk?signup=1", "/organizations/login?signup=1"],
    ["/instansi/log", "/organizations/log"],
    ["/instansi/ORG-1", "/organizations/ORG-1"],
    ["/instansi/ORG-1/riwayat", "/organizations/ORG-1/deliveries"],
    ["/lokasi?to=3201010", "/location?to=3201010"],
  ])("%s → 308 %s", async (from, to) => {
    const res = await hit(from);
    expect(res.status).toBe(308);
    const location = getRedirectUrl(res) ?? "";
    expect(location.replace(/^http:\/\/0\.0\.0\.0:8080/, "")).toBe(to);
  });

  test("current routes are not redirected", async () => {
    for (const path of [
      "/",
      "/cases/C-1",
      "/cases/C-1/report",
      "/validators",
      "/validators/login",
      "/validators/findings/F-1",
      "/organizations",
      "/organizations/login",
      "/organizations/ORG-1/deliveries",
      "/log/3",
      "/status",
      "/ops",
    ]) {
      expect((await hit(path)).status).not.toBe(308);
    }
  });
});
