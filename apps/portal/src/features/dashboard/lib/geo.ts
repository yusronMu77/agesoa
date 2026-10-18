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
  /** Label anchor (area centroid of the largest ring). */
  cx: number;
  cy: number;
}

function polygons(geometry: Geometry): Ring[][] {
  return geometry.type === "Polygon" ? [geometry.coordinates as Ring[]] : (geometry.coordinates as Ring[][]);
}

interface Fit {
  scale: number;
  x: (lon: number) => number;
  y: (lat: number) => number;
}

/** Bounding box fit of every shape into width × height (y grows downwards); null when there is nothing to draw. */
function fit(shapes: { geometry: Geometry }[], width: number, height: number, margin: number): Fit | null {
  const points = shapes.flatMap((s) => polygons(s.geometry).flat(2));
  if (points.length === 0) return null;
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  const [minLon, maxLon, minLat, maxLat] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
  const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = Math.max((maxLon - minLon) * kx, 1e-9);
  const spanY = Math.max(maxLat - minLat, 1e-9);
  const scale = Math.min((width - 2 * margin) / spanX, (height - 2 * margin) / spanY);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  return {
    scale,
    x: (lon: number) => offsetX + (lon - minLon) * kx * scale,
    y: (lat: number) => offsetY + (maxLat - lat) * scale,
  };
}

/** Projects every shape into a width × height box (y grows downwards) with a margin. */
export function projectShapes(
  shapes: { key: string; geometry: Geometry }[],
  width: number,
  height: number,
  margin = 8,
): Projected[] {
  const f = fit(shapes, width, height, margin);
  if (!f) return [];
  const round = (n: number) => Math.round(n * 10) / 10;

  return shapes.map(({ key, geometry }) => {
    const rings = polygons(geometry).flat();
    const path = rings
      .map((ring) => ring.map(([lon, lat], i) => `${i === 0 ? "M" : "L"}${round(f.x(lon))},${round(f.y(lat))}`).join("") + "Z")
      .join("");
    const projected = rings.map((ring) => ring.map(([lon, lat]) => [f.x(lon), f.y(lat)] as [number, number]));
    const largest = projected.reduce((a, b) => (Math.abs(ringArea(b)) > Math.abs(ringArea(a)) ? b : a), projected[0]);
    const [cx, cy] = centroid(largest);
    return { key, path, cx: round(cx), cy: round(cy) };
  });
}

/** Signed area of a ring (shoelace). */
function ringArea(ring: [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return sum / 2;
}

/** Area centroid of a ring (label anchor); the mean of its points when the area is zero. */
function centroid(ring: [number, number][]): [number, number] {
  const a = ringArea(ring);
  if (Math.abs(a) < 1e-9) {
    const n = ring.length || 1;
    return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
  }
  let x = 0;
  let y = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const cross = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    x += (ring[i][0] + ring[i + 1][0]) * cross;
    y += (ring[i][1] + ring[i + 1][1]) * cross;
  }
  return [x / (6 * a), y / (6 * a)];
}

/** Kilometres per degree of latitude (mean). */
const KM_PER_DEGREE = 111.32;

/**
 * Scale bar of the map: a round distance (1, 2, 5, 10, 20 or 50 km) no longer than `maxUnits` drawing units, with
 * its length in units. Null when there is nothing to draw.
 */
export function scaleBar(
  shapes: { geometry: Geometry }[],
  width: number,
  height: number,
  maxUnits = 120,
  margin = 8,
): { km: number; units: number } | null {
  const f = fit(shapes, width, height, margin);
  if (!f) return null;
  const unitsPerKm = f.scale / KM_PER_DEGREE;
  const km = [50, 20, 10, 5, 2, 1].find((d) => d * unitsPerKm <= maxUnits) ?? 1;
  return { km, units: Math.round(km * unitsPerKm * 10) / 10 };
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
