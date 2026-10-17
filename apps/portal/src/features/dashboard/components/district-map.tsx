import { TableWrap } from "@/components/ui/table-wrap";
import { type DistrictMap, MAP_HEIGHT, MAP_WIDTH } from "../lib/district-map";
import { shade } from "../lib/geo";

/** Cases by district: SVG map (with a text description for screen readers) and the same numbers as a table. */
export function DistrictMapSection({ map }: { map: DistrictMap }) {
  const { districts, shapes, districtByCode, casesPerDistrict, max, unmapped, regencies, anySynthetic } = map;
  return (
    <section aria-labelledby="map-heading" className="card">
      <h2 id="map-heading">Cases by district</h2>
      {anySynthetic ? (
        <p className="muted">
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
            <title id="map-title">Map of districts in {regencies.join(", ")}</title>
            <desc id="map-desc">
              {districts.map((d) => `${d.district_name}: ${casesPerDistrict.get(d.district_code) ?? 0} cases`).join("; ")}
            </desc>
            {shapes.map((s) => {
              const d = districtByCode.get(s.key)!;
              const n = casesPerDistrict.get(s.key) ?? 0;
              return (
                <g key={s.key} data-testid="district" data-district={d.district_name} data-cases={n}>
                  <path d={s.path} className={`district district--${shade(n, max)}`}>
                    <title>
                      {d.district_name}: {n} {n === 1 ? "case" : "cases"}
                    </title>
                  </path>
                  {n > 0 ? (
                    <text x={s.cx} y={s.cy} className="district-count" textAnchor="middle" dominantBaseline="middle">
                      {n}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
          <figcaption className="muted">Darker = more cases. {regencies.join(", ")}.</figcaption>
        </figure>
      )}
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
        <p className="muted">{unmapped.length} case(s) without a matching district boundary are listed below only.</p>
      ) : null}
    </section>
  );
}
