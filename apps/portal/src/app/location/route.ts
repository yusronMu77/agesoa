import { loadConfig } from "@/lib/config";
import { AREA_COOKIE, districtAt, isAreaCode } from "@/lib/nearby";
import { listCollection, type PublicDistrict } from "@/lib/readmodel";
import { safePath, seeOther } from "@/lib/redirect";

/**
 * "Di sekitar Anda" location (SCR-040). Only the district code is remembered (a cookie for a year), never a point.
 *
 *   GET  /location?to=<district code>&back=/   the reader chose a district ("Ubah lokasi"); `to=` empty forgets it
 *   POST /location  lat, lon, back             "Gunakan lokasi saya": the point is turned into the published district
 *                                            that contains it and then dropped (not logged, not stored)
 */
const MAX_AGE = 60 * 60 * 24 * 365;

function withFlag(back: string, flag: string | null): string {
  const [path, hash = ""] = back.split("#");
  const url = new URL(path, "http://portal.invalid");
  url.searchParams.delete("lokasi");
  if (flag) url.searchParams.set("lokasi", flag);
  return `${url.pathname}${url.search}#${hash || "nearby-heading"}`;
}

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const to = params.get("to");
  const back = safePath(params.get("back"));
  const response = seeOther(withFlag(back, null));
  if (to === "" || to === null) response.cookies.delete(AREA_COOKIE);
  else if (isAreaCode(to)) response.cookies.set(AREA_COOKIE, to, { path: "/", maxAge: MAX_AGE, sameSite: "lax" });
  return response;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const back = safePath(String(form.get("back") ?? "/"));
  const lon = Number(form.get("lon"));
  const lat = Number(form.get("lat"));
  const regions = await listCollection<PublicDistrict>(loadConfig(), "public_regions");
  if (!regions.ok) return seeOther(withFlag(back, "error"));
  const district = districtAt(regions.data, lon, lat);
  if (!district) return seeOther(withFlag(back, "outside"));
  const response = seeOther(withFlag(back, null));
  response.cookies.set(AREA_COOKIE, district.district_code, { path: "/", maxAge: MAX_AGE, sameSite: "lax" });
  return response;
}
