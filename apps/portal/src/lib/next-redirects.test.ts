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
    ["/findings/F-1", "/temuan/F-1"],
    ["/cases/CASE-1?verify=1", "/temuan/CASE-1?verify=1"],
    ["/cases/CASE-1/report", "/temuan/CASE-1/laporan"],
    ["/validate?filter=decided", "/validator?filter=decided"],
    ["/validate/F-1", "/validator/temuan/F-1"],
    ["/validators/register", "/validator/daftar"],
    ["/organizations?kind=agency", "/instansi?kind=agency"],
    ["/organizations/ORG-1", "/instansi/ORG-1"],
    ["/organizations/ORG-1/deliveries", "/instansi/ORG-1/riwayat"],
  ])("%s → 308 %s", async (from, to) => {
    const res = await hit(from);
    expect(res.status).toBe(308);
    const location = getRedirectUrl(res) ?? "";
    expect(location.replace(/^http:\/\/0\.0\.0\.0:8080/, "")).toBe(to);
  });

  test("current routes are not redirected", async () => {
    for (const path of ["/", "/temuan/C-1", "/validator", "/instansi/ORG-1/riwayat", "/log/3", "/status", "/ops"]) {
      expect((await hit(path)).status).not.toBe(308);
    }
  });
});
