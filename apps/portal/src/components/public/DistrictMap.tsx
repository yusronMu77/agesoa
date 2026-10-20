import { MapPinned } from "lucide-react";
import type { Translate } from "@/lib/i18n/core";
import { type Geometry, projectShapes, shade } from "@/lib/geo";
import { heatLegend, shortDistrictName } from "@/lib/publicview";
import type { PublicDistrict } from "@/lib/readmodel";
import { count } from "./text";

const MAP_WIDTH = 640;
const MAP_HEIGHT = 520;

/**
 * SCR-040 "Sebaran kasus": district heat map drawn from the read model's boundaries (no tiles, no third-party map
 * service), its legend, and the same numbers as a table for screen readers and small screens.
 */
export function DistrictMap({
  t,
  districts,
  perDistrict,
  max,
  unmapped,
  anySynthetic,
}: {
  t: Translate;
  districts: PublicDistrict[];
  perDistrict: Map<string, number>;
  max: number;
  unmapped: number;
  anySynthetic: boolean;
}) {
  const shapes = projectShapes(
    districts.map((d) => ({ key: d.district_code, geometry: JSON.parse(d.geometry) as Geometry })),
    MAP_WIDTH,
    MAP_HEIGHT,
  );
  const byCode = new Map(districts.map((d) => [d.district_code, d]));
  const regencies = [...new Set(districts.map((d) => d.regency_name))].join(", ");
  const legend = heatLegend(max);

  return (
    <section className="card pub-map" aria-labelledby="map-heading">
      <div className="pub-section-head">
        <h2 id="map-heading">{t("public.map.title")}</h2>
        {anySynthetic ? <span className="pub-map__fictional">{t("public.map.fictional")}</span> : null}
      </div>

      {shapes.length === 0 ? (
        <p className="pub-empty" data-testid="map-empty">
          <MapPinned aria-hidden size={20} strokeWidth={2} />
          {t("public.map.empty")}
        </p>
      ) : (
        <figure className="district-map pub-map__figure">
          <svg
            viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
            role="img"
            aria-labelledby="map-title map-desc"
            data-testid="district-map"
          >
            <title id="map-title">{t("public.map.svgTitle", { regencies })}</title>
            <desc id="map-desc">
              {districts
                .map((d) => `${d.district_name}: ${count(t, "cases", perDistrict.get(d.district_code) ?? 0)}`)
                .join("; ")}
            </desc>
            {shapes.map((s) => {
              const d = byCode.get(s.key)!;
              const n = perDistrict.get(s.key) ?? 0;
              const level = shade(n, max);
              return (
                <g key={s.key} data-testid="district" data-district={d.district_name} data-cases={n}>
                  <path d={s.path} className={`district district--${level}`}>
                    <title>{`${d.district_name}: ${count(t, "cases", n)}`}</title>
                  </path>
                  <text
                    x={s.cx}
                    y={s.cy}
                    className={`pub-map__label${level >= 3 ? " pub-map__label--on-dark" : ""}`}
                    textAnchor="middle"
                    aria-hidden="true"
                  >
                    <tspan x={s.cx} dy="-0.2em" className="pub-map__name">
                      {shortDistrictName(d.district_name)}
                    </tspan>
                    {n > 0 ? (
                      <tspan x={s.cx} dy="1.25em" className="pub-map__count">
                        {n}
                      </tspan>
                    ) : null}
                  </text>
                </g>
              );
            })}
          </svg>
          <figcaption className="pub-legend">
            <span className="muted small">{t("public.map.legend")}</span>
            <ul>
              {legend.map((step) => (
                <li key={step.level}>
                  <span className={`pub-legend__swatch district--${step.level}`} aria-hidden="true" />
                  {step.from === step.to ? step.from : `${step.from}–${step.to}`}
                </li>
              ))}
            </ul>
          </figcaption>
        </figure>
      )}

      <details className="pub-map__table">
        <summary>{t("public.map.table")}</summary>
        {anySynthetic ? <p className="muted small">{t("public.map.demoNote")}</p> : null}
        <div className="table-wrap" role="region" aria-label={t("public.map.tableLabel")} tabIndex={0}>
          <table data-testid="district-table">
            <thead>
              <tr>
                <th scope="col">{t("public.map.col.district")}</th>
                <th scope="col">{t("public.map.col.regency")}</th>
                <th scope="col" className="num">
                  {t("public.map.col.cases")}
                </th>
              </tr>
            </thead>
            <tbody>
              {districts.map((d) => (
                <tr key={d.district_code}>
                  <td>{d.district_name}</td>
                  <td>{d.regency_name}</td>
                  <td className="num">{perDistrict.get(d.district_code) ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {unmapped > 0 ? <p className="muted small">{t("public.map.unmapped", { n: unmapped })}</p> : null}
      </details>
    </section>
  );
}
