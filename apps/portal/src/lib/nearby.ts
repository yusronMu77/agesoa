/**
 * SCR-040 "Di sekitar Anda": the reader's area and the published cases around it. The reader chooses a district
 * (or lets the browser locate them once; the server turns the point into a district and forgets it). Only the
 * district code is remembered, in a cookie: never coordinates. Distances are measured between district centres, so
 * they are honest at district scale and never invented. Pure functions, unit tested.
 */

import type { Geometry } from "./geo";
import type { EvidenceStatus, PublicCase, PublicDistrict, PublicFinding } from "./readmodel";
import { districtKey } from "./readmodel";
import type { LocalizedText } from "./localized";

/** Cookie with the district code the reader chose ("lokasi Anda"); no coordinates are ever stored. */
export const AREA_COOKIE = "agesoa_area";

/** Radius of "Di sekitar Anda" around the centre of the reader's district. */
export const NEARBY_RADIUS_KM = 15;

/** Rows shown in "Di sekitar Anda". */
export const NEARBY_LIMIT = 3;

type Ring = [number, number][];

function outerRings(geometry: Geometry): Ring[] {
  return geometry.type === "Polygon"
    ? [(geometry.coordinates as Ring[])[0]]
    : (geometry.coordinates as Ring[][]).map((polygon) => polygon[0]);
}

function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/** Centre [lon, lat] of a district: area-weighted centroid of its largest outer ring (vertex mean if degenerate). */
export function centroid(geometry: Geometry): [number, number] | null {
  const rings = outerRings(geometry).filter((r) => r && r.length >= 3);
  if (rings.length === 0) return null;
  const ring = rings.reduce((a, b) => (Math.abs(ringArea(b)) > Math.abs(ringArea(a)) ? b : a));
  const area = ringArea(ring);
  if (Math.abs(area) < 1e-12) {
    const n = ring.length;
    return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    const f = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  return [cx / (6 * area), cy / (6 * area)];
}

/** Great-circle distance in km between two [lon, lat] points. */
export function distanceKm(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function inRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Whether the point lies inside the district (holes respected). */
export function containsPoint(geometry: Geometry, lon: number, lat: number): boolean {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates as Ring[]] : (geometry.coordinates as Ring[][]);
  return polygons.some(
    (rings) => rings.length > 0 && inRing(lon, lat, rings[0]) && !rings.slice(1).some((hole) => inRing(lon, lat, hole)),
  );
}

function parseGeometry(raw: string): Geometry | null {
  try {
    const g = JSON.parse(raw) as Geometry;
    return g && (g.type === "Polygon" || g.type === "MultiPolygon") && Array.isArray(g.coordinates) ? g : null;
  } catch {
    return null;
  }
}

/** The published district that contains the point, or null (outside the mapped area). */
export function districtAt(districts: PublicDistrict[], lon: number, lat: number): PublicDistrict | null {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return districts.find((d) => {
    const g = parseGeometry(d.geometry);
    return g ? containsPoint(g, lon, lat) : false;
  }) ?? null;
}

/** A district code as the cookie may hold it (anything else is ignored). */
export function isAreaCode(value: unknown): value is string {
  return typeof value === "string" && /^[\w.\- ()]{1,120}$/.test(value);
}

export interface NearbyRow {
  case: PublicCase;
  /** Audit report summary, else the first finding statement, else null. */
  title: string | null;
  title_i18n: LocalizedText | null;
  status: EvidenceStatus | null;
  district: PublicDistrict;
  /** Distance between the district centres, km; 0 for the reader's own district. */
  km: number;
  sameArea: boolean;
}

const STRENGTH: Record<EvidenceStatus, number> = { alleged: 0, supported: 1, proven: 2 };

/**
 * Published cases with at least one finding within `radiusKm` of the centre of the reader's district, nearest first
 * (then strongest evidence, then most reports). Synthetic cases only count on synthetic districts and real ones on
 * real districts, as on the map.
 */
export function nearbyCases(
  area: PublicDistrict,
  districts: PublicDistrict[],
  cases: PublicCase[],
  findings: PublicFinding[],
  radiusKm = NEARBY_RADIUS_KM,
  limit = NEARBY_LIMIT,
): NearbyRow[] {
  const centres = new Map<string, [number, number]>();
  for (const d of districts) {
    const g = parseGeometry(d.geometry);
    const c = g ? centroid(g) : null;
    if (c) centres.set(d.district_code, c);
  }
  const origin = centres.get(area.district_code);
  if (!origin) return [];
  const byKey = new Map<string, PublicDistrict>();
  for (const d of districts) {
    byKey.set(d.district_code, d);
    byKey.set(d.district_name, d);
  }
  const findingsOf = new Map<string, PublicFinding[]>();
  for (const f of findings) if (f.case_id) findingsOf.set(f.case_id, [...(findingsOf.get(f.case_id) ?? []), f]);

  const rows: NearbyRow[] = [];
  for (const c of cases) {
    const own = findingsOf.get(c.case_id) ?? [];
    if (own.length === 0) continue;
    const key = districtKey(c.region);
    const district = key ? (byKey.get(key) ?? (c.region?.district_name ? byKey.get(c.region.district_name) : undefined)) : undefined;
    if (!district || district.synthetic !== c.synthetic) continue;
    const centre = centres.get(district.district_code);
    if (!centre) continue;
    const sameArea = district.district_code === area.district_code;
    const km = sameArea ? 0 : distanceKm(origin, centre);
    if (km > radiusKm) continue;
    const first = own.find((f) => f.statement);
    rows.push({
      case: c,
      title: c.audit_report?.summary ?? first?.statement ?? null,
      title_i18n: c.audit_report?.summary ? (c.audit_report.summary_i18n ?? null) : (first?.statement_i18n ?? null),
      status: c.max_finding_status,
      district,
      km,
      sameArea,
    });
  }
  const strength = (s: EvidenceStatus | null) => (s ? STRENGTH[s] : -1);
  return rows
    .sort(
      (a, b) =>
        a.km - b.km ||
        strength(b.status) - strength(a.status) ||
        b.case.report_count - a.case.report_count ||
        a.case.case_id.localeCompare(b.case.case_id),
    )
    .slice(0, limit);
}
