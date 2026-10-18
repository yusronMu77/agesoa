/**
 * District boundaries (GeoJSON, lon/lat) to SVG paths for the public map. Plain equirectangular projection over
 * the bounding box with the latitude scale corrected at the centre: enough for a regency-sized area, no tiles,
 * no third-party map service.
 */

type Ring = [number, number][];
export interface Geometry {
  type: "Polygon" | "MultiPolygon";
  coordinates: Ring[] | Ring[][];
}

export interface Projected {
  key: string;
  path: string;
  /** Label anchor (centre of the largest ring's bounding box). */
  cx: number;
  cy: number;
}

function polygons(geometry: Geometry): Ring[][] {
  return geometry.type === "Polygon" ? [geometry.coordinates as Ring[]] : (geometry.coordinates as Ring[][]);
}

/** Projects every shape into a width × height box (y grows downwards) with a margin. */
export function projectShapes(
  shapes: { key: string; geometry: Geometry }[],
  width: number,
  height: number,
  margin = 8,
): Projected[] {
  const points = shapes.flatMap((s) => polygons(s.geometry).flat(2));
  if (points.length === 0) return [];
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  const [minLon, maxLon, minLat, maxLat] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
  const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = Math.max((maxLon - minLon) * kx, 1e-9);
  const spanY = Math.max(maxLat - minLat, 1e-9);
  const scale = Math.min((width - 2 * margin) / spanX, (height - 2 * margin) / spanY);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  const x = (lon: number) => offsetX + (lon - minLon) * kx * scale;
  const y = (lat: number) => offsetY + (maxLat - lat) * scale;
  const round = (n: number) => Math.round(n * 10) / 10;

  return shapes.map(({ key, geometry }) => {
    const rings = polygons(geometry).flat();
    const path = rings
      .map((ring) => ring.map(([lon, lat], i) => `${i === 0 ? "M" : "L"}${round(x(lon))},${round(y(lat))}`).join("") + "Z")
      .join("");
    const largest = rings.reduce((a, b) => (b.length > a.length ? b : a), rings[0]);
    const xs = largest.map((p) => x(p[0]));
    const ys = largest.map((p) => y(p[1]));
    return {
      key,
      path,
      cx: round((Math.min(...xs) + Math.max(...xs)) / 2),
      cy: round((Math.min(...ys) + Math.max(...ys)) / 2),
    };
  });
}

/**
 * Heat legend of the public map: fixed bins, so one case always looks like one case whatever the busiest district
 * has (a scale relative to the maximum drew every district darkest when each had one case).
 */
export const HEAT_BINS: readonly { level: number; label: string; min: number }[] = [
  { level: 0, label: "0", min: 0 },
  { level: 1, label: "1", min: 1 },
  { level: 2, label: "2–3", min: 2 },
  { level: 3, label: "4–5", min: 4 },
  { level: 4, label: "6 or more", min: 6 },
];

/** Fill level 0..4 for a number of cases: 0 / 1 / 2-3 / 4-5 / 6 or more. */
export function shade(count: number): number {
  let level = 0;
  for (const bin of HEAT_BINS) if (count >= bin.min) level = bin.level;
  return level;
}
