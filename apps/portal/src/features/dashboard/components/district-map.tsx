import { TableWrap } from "@/components/ui/table-wrap";
import { type DistrictMap, MAP_HEIGHT, MAP_WIDTH, shortDistrictName } from "../lib/district-map";
import { HEAT_BINS, shade } from "../lib/geo";

/** Shades dark enough to need light text on top. */
const DARK_SHADE = 3;

/** Fixed heat bins of the map (0 / 1 / 2–3 / 4–5 / 6 or more), with the colour of each. */
function HeatLegend() {
  return (
    <div className="map-legend">
      <span id="map-legend-title">Number of cases</span>
      <ul aria-labelledby="map-legend-title">
        {HEAT_BINS.map((b) => (
          <li key={b.level}>
            <span className={`map-swatch district--${b.level}`} aria-hidden="true" />
            {b.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** North arrow in the top right corner of the map (decorative: north is always up). */
function NorthArrow() {
  const x = MAP_WIDTH - 22;
  return (
    <g className="map-north" aria-hidden="true">
      <path d={`M${x},10 L${x + 6},26 L${x},22 L${x - 6},26 Z`} />
      <text x={x} y={38} textAnchor="middle">
        N
      </text>
    </g>
  );
}

/** Scale bar in the bottom left corner: a round distance at the scale of this map. */
function ScaleBar({ km, units }: { km: number; units: number }) {
  const x = 8;
  const y = MAP_HEIGHT - 12;
  return (
    <g className="map-scale" aria-hidden="true">
      <path d={`M${x},${y - 5} V${y} H${x + units} V${y - 5}`} />
      <text x={x + units + 6} y={y} dominantBaseline="middle">
        {km} km
      </text>
    </g>
  );
}

/** The numbers of the map as a table: the accessible alternative to the map, folded under it. */
function DistrictTable({ map }: { map: DistrictMap }) {
  const { districts, casesPerDistrict, unmapped } = map;
  return (
    <details className="district-table">
      <summary>Show the numbers as a table</summary>
      <TableWrap label="Cases per district">
        <table data-testid="district-table">
          <thead>
            <tr>
              <th scope="col">District</th>
              <th scope="col">Regency</th>
              <th scope="col" className="num">
                Cases
              </th>
            </tr>
          </thead>
          <tbody>
            {districts.map((d) => (
              <tr key={d.district_code}>
                <td>{d.district_name}</td>
                <td>{d.regency_name}</td>
                <td className="num">{casesPerDistrict.get(d.district_code) ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {unmapped.length > 0 ? (
        <p className="muted small">{unmapped.length} case(s) without a matching district boundary are counted in the list only.</p>
      ) : null}
    </details>
  );
}

/** Penpot `Kartu peta`: cases by district as a choropleth drawn from the published boundaries (no map tiles). */
export function DistrictMapSection({ map }: { map: DistrictMap }) {
  const { districts, shapes, districtByCode, casesPerDistrict, regencies, anySynthetic, scale } = map;
  return (
    <section aria-labelledby="map-heading" className="map-card">
      <div className="map-card__head">
        <h2 id="map-heading">Case distribution</h2>
        {anySynthetic ? <span className="map-card__note">Fictional region</span> : null}
      </div>
      {shapes.length === 0 ? (
        <p className="muted" data-testid="map-empty">
          No district boundaries published yet.
        </p>
      ) : (
        <figure className="district-map">
          <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} role="img" aria-labelledby="map-title map-desc" data-testid="district-map">
            <title id="map-title">{`Map of districts in ${regencies.join(", ")}`}</title>
            <desc id="map-desc">
              {districts.map((d) => `${d.district_name}: ${casesPerDistrict.get(d.district_code) ?? 0} cases`).join("; ")}
            </desc>
            <g className="map-regency">
              {shapes.map((s) => {
                const d = districtByCode.get(s.key)!;
                const n = casesPerDistrict.get(s.key) ?? 0;
                return (
                  <g key={s.key} data-testid="district" data-district={d.district_name} data-cases={n}>
                    <path d={s.path} className={`district district--${shade(n)}`}>
                      {/* One text node: React cannot hydrate several text nodes inside an SVG <title>. */}
                      <title>{`${d.district_name}: ${n} ${n === 1 ? "case" : "cases"}`}</title>
                    </path>
                  </g>
                );
              })}
            </g>
            <g className="map-labels" aria-hidden="true">
              {shapes.map((s) => {
                const d = districtByCode.get(s.key)!;
                const n = casesPerDistrict.get(s.key) ?? 0;
                const onDark = shade(n) >= DARK_SHADE;
                return (
                  <text
                    key={s.key}
                    x={s.cx}
                    y={n > 0 ? s.cy - 9 : s.cy}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className={onDark ? "district-label district-label--on-dark" : "district-label"}
                  >
                    <tspan className="district-name">{shortDistrictName(d.district_name)}</tspan>
                    {n > 0 ? (
                      <tspan className="district-count" x={s.cx} dy={19}>
                        {n}
                      </tspan>
                    ) : null}
                  </text>
                );
              })}
            </g>
            <NorthArrow />
            {scale ? <ScaleBar {...scale} /> : null}
          </svg>
          <HeatLegend />
          <figcaption className="muted small">
            {regencies.join(", ")}. Districts only: no coordinates of any report and no names of people.
          </figcaption>
        </figure>
      )}
      <DistrictTable map={map} />
    </section>
  );
}
