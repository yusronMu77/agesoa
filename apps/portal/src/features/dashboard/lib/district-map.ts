/** Cases per district for the public map (no tiles, no coordinates of any case: districts only). */

import type { PublicCase, PublicDistrict } from "@/services/read-model/read-model.model";
import { type Geometry, type Projected, projectShapes, scaleBar } from "./geo";

export const MAP_WIDTH = 560;
export const MAP_HEIGHT = 440;
/** Room around the regency for the north arrow and the scale bar. */
export const MAP_MARGIN = 28;

/** "Kecamatan Cibening (fictional)" → "Cibening": the label drawn on the map (the full name stays in titles). */
export function shortDistrictName(name: string): string {
  return name.replace(/^kecamatan\s+/i, "").replace(/\s*\(fictional\)$/i, "");
}

/** Key that joins a case/finding region to a district boundary: code first, name for codeless (fictional) data. */
export function districtKey(region: { district_code?: string | null; district_name?: string | null } | null): string | null {
  if (!region) return null;
  return region.district_code ?? region.district_name ?? null;
}

export interface DistrictMap {
  districts: PublicDistrict[];
  shapes: Projected[];
  /** Round distance and its length in map units, for the scale bar. */
  scale: { km: number; units: number } | null;
  districtByCode: Map<string, PublicDistrict>;
  casesPerDistrict: Map<string, number>;
  /** Cases of the busiest district. */
  max: number;
  /** Cases without a matching boundary; listed, never drawn. */
  unmapped: PublicCase[];
  regencies: string[];
  anySynthetic: boolean;
}

/**
 * A case is drawn on a district only when both are synthetic or both are real: synthetic (demo) cases never
 * appear on a real regency, and real cases never on the fictional one.
 */
export function buildDistrictMap(cases: PublicCase[], districts: PublicDistrict[]): DistrictMap {
  const byKey = new Map<string, PublicDistrict>();
  for (const d of districts) {
    byKey.set(d.district_code, d);
    byKey.set(d.district_name, d);
  }
  const casesPerDistrict = new Map<string, number>();
  const unmapped: PublicCase[] = [];
  for (const c of cases) {
    const key = districtKey(c.region);
    const district = key ? (byKey.get(key) ?? (c.region?.district_name ? byKey.get(c.region.district_name) : undefined)) : undefined;
    if (district && district.synthetic === c.synthetic) {
      casesPerDistrict.set(district.district_code, (casesPerDistrict.get(district.district_code) ?? 0) + 1);
    } else {
      unmapped.push(c);
    }
  }
  const geometries = districts.map((d) => ({ key: d.district_code, geometry: JSON.parse(d.geometry) as Geometry }));
  return {
    districts,
    shapes: projectShapes(geometries, MAP_WIDTH, MAP_HEIGHT, MAP_MARGIN),
    scale: scaleBar(geometries, MAP_WIDTH, MAP_HEIGHT, 120, MAP_MARGIN),
    districtByCode: new Map(districts.map((d) => [d.district_code, d])),
    casesPerDistrict,
    max: Math.max(0, ...casesPerDistrict.values()),
    unmapped,
    regencies: [...new Set(districts.map((d) => d.regency_name))],
    anySynthetic: cases.some((c) => c.synthetic) || districts.some((d) => d.synthetic),
  };
}

/** Sum of a count-by-key record from the stats document. */
export function total(record: Record<string, number> | undefined): number {
  return Object.values(record ?? {}).reduce((a, b) => a + b, 0);
}
