import { TableWrap } from "@/components/ui/table-wrap";
import { type DistrictMap, MAP_HEIGHT, MAP_WIDTH } from "../lib/district-map";
import { HEAT_BINS, shade } from "../lib/geo";

/** Shades dark enough to need light count text on top. */
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

/** Cases by district: SVG map (with a text description for screen readers) and the heat legend. */
export function DistrictMapSection({ map }: { map: DistrictMap }) {
  const { districts, shapes, districtByCode, casesPerDistrict, regencies, anySynthetic } = map;
  return (
    <section aria-labelledby="map-heading" className="card map-card">
      <h2 id="map-heading">Cases by district</h2>
      {anySynthetic ? (
        <p className="muted small">
          Demo data: the regency on this map is fictional, and synthetic cases are drawn only on fictional districts.
        </p>
      ) : null}
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
            {shapes.map((s) => {
              const d = districtByCode.get(s.key)!;
              const n = casesPerDistrict.get(s.key) ?? 0;
              const level = shade(n);
              return (
                <g key={s.key} data-testid="district" data-district={d.district_name} data-cases={n}>
                  <path d={s.path} className={`district district--${level}`}>
                    {/* One text node: React cannot hydrate several text nodes inside an SVG <title>. */}
                    <title>{`${d.district_name}: ${n} ${n === 1 ? "case" : "cases"}`}</title>
                  </path>
                  {n > 0 ? (
                    <text
                      x={s.cx}
                      y={s.cy}
                      className={level >= DARK_SHADE ? "district-count district-count--on-dark" : "district-count"}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {n}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
          <HeatLegend />
          <figcaption className="muted small">Darker = more cases. {regencies.join(", ")}.</figcaption>
        </figure>
      )}
    </section>
  );
}

/** The numbers of the map as a table (also the accessible alternative to the map). */
export function DistrictTable({ map }: { map: DistrictMap }) {
  const { districts, casesPerDistrict, unmapped } = map;
  return (
    <div className="district-table">
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
        <p className="muted small">{unmapped.length} case(s) without a matching district boundary are listed below only.</p>
      ) : null}
    </div>
  );
}
