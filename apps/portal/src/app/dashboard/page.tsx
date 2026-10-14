import type { Metadata } from "next";
import Link from "next/link";
import { EvidenceBadge } from "@/components/EvidenceBadge";
import { loadConfig } from "@/lib/config";
import { formatTime } from "@/lib/format";
import { type Geometry, projectShapes, shade } from "@/lib/geo";
import {
  districtKey,
  getDocument,
  listCollection,
  type PublicCase,
  type PublicDistrict,
  type PublicFinding,
  type PublicStats,
} from "@/lib/readmodel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Public dashboard" };

const MAP_WIDTH = 640;
const MAP_HEIGHT = 420;

function count(record: Record<string, number> | undefined): number {
  return Object.values(record ?? {}).reduce((a, b) => a + b, 0);
}

export default async function DashboardPage() {
  const config = loadConfig();
  const [cases, findings, districts, stats] = await Promise.all([
    listCollection<PublicCase>(config, "public_cases"),
    listCollection<PublicFinding>(config, "public_findings"),
    listCollection<PublicDistrict>(config, "public_regions"),
    getDocument<PublicStats>(config, "public_stats/summary"),
  ]);

  if (!cases.ok || !findings.ok || !districts.ok) {
    return (
      <>
        <h1>Public dashboard</h1>
        <section className="callout callout--error" aria-labelledby="dash-error">
          <h2 id="dash-error">The public data is temporarily unavailable</h2>
          <p>The read model did not answer. Please try again in a moment.</p>
        </section>
      </>
    );
  }

  // A case is drawn on a district only when both are synthetic or both are real: synthetic (demo) cases never
  // appear on a real regency, and real cases never on the fictional one.
  const byKey = new Map<string, PublicDistrict>();
  for (const d of districts.data) {
    byKey.set(d.district_code, d);
    byKey.set(d.district_name, d);
  }
  const casesPerDistrict = new Map<string, number>();
  const unmapped: PublicCase[] = [];
  for (const c of cases.data) {
    const key = districtKey(c.region);
    const district = key ? (byKey.get(key) ?? (c.region?.district_name ? byKey.get(c.region.district_name) : undefined)) : undefined;
    if (district && district.synthetic === c.synthetic) {
      casesPerDistrict.set(district.district_code, (casesPerDistrict.get(district.district_code) ?? 0) + 1);
    } else {
      unmapped.push(c);
    }
  }
  const max = Math.max(0, ...casesPerDistrict.values());
  const shapes = projectShapes(
    districts.data.map((d) => ({ key: d.district_code, geometry: JSON.parse(d.geometry) as Geometry })),
    MAP_WIDTH,
    MAP_HEIGHT,
  );
  const districtByCode = new Map(districts.data.map((d) => [d.district_code, d]));
  const regencies = [...new Set(districts.data.map((d) => d.regency_name))];
  const anySynthetic = cases.data.some((c) => c.synthetic) || districts.data.some((d) => d.synthetic);
  const sortedFindings = [...findings.data].sort((a, b) => (a.case_id ?? "").localeCompare(b.case_id ?? ""));
  const summary = stats.ok ? stats.data : null;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Public dashboard</h1>
          <p className="muted">
            Cases and audit findings by district. Locations are shown as districts only, never as coordinates, and no
            person is named. Data from the public read model{summary ? `, updated ${formatTime(summary.updated_at)}` : ""}.
          </p>
        </div>
      </div>

      <ul className="stat-grid" aria-label="Summary" data-testid="dashboard-stats">
        <li className="card">
          <span className="stat-value">{cases.data.length}</span>
          <span className="muted">cases</span>
        </li>
        <li className="card">
          <span className="stat-value">{findings.data.length}</span>
          <span className="muted">findings</span>
        </li>
        <li className="card">
          <span className="stat-value">{summary ? count(summary.validations_by_outcome) : "—"}</span>
          <span className="muted">validated by people</span>
        </li>
        <li className="card">
          <span className="stat-value">{summary?.reports_received ?? "—"}</span>
          <span className="muted">citizen reports</span>
        </li>
      </ul>

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
            <svg
              viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
              role="img"
              aria-labelledby="map-title map-desc"
              data-testid="district-map"
            >
              <title id="map-title">Map of districts in {regencies.join(", ")}</title>
              <desc id="map-desc">
                {districts.data
                  .map((d) => `${d.district_name}: ${casesPerDistrict.get(d.district_code) ?? 0} cases`)
                  .join("; ")}
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
            <figcaption className="muted">
              Darker = more cases. {regencies.join(", ")}.
            </figcaption>
          </figure>
        )}
        <div className="table-wrap" role="region" aria-label="Cases per district" tabIndex={0}>
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
              {districts.data.map((d) => (
                <tr key={d.district_code}>
                  <td>{d.district_name}</td>
                  <td>{d.regency_name}</td>
                  <td className="num">{casesPerDistrict.get(d.district_code) ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {unmapped.length > 0 ? (
          <p className="muted">{unmapped.length} case(s) without a matching district boundary are listed below only.</p>
        ) : null}
      </section>

      <section aria-labelledby="findings-heading">
        <h2 id="findings-heading">Audit findings</h2>
        <p className="muted">
          AI drafts findings; a finding is final only after a quorum of human validators approved it.
        </p>
        {sortedFindings.length === 0 ? (
          <p className="callout">No findings published yet.</p>
        ) : (
          <ul className="finding-list" data-testid="finding-list">
            {sortedFindings.map((f) => (
              <li key={f.finding_id} className="card" data-testid="finding">
                <div className="finding-head">
                  <EvidenceBadge status={f.status} />
                  {f.validation ? (
                    <span
                      className={`badge ${f.validation.outcome === "approved" ? "badge--ok" : "badge--warn"}`}
                      data-testid="validation-status"
                    >
                      {f.validation.outcome === "approved"
                        ? `Validated by ${f.validation.decisions.length} people`
                        : "Returned to the audit"}
                    </span>
                  ) : (
                    <span className="badge badge--neutral" data-testid="validation-status">
                      Waiting for validation
                    </span>
                  )}
                  {f.synthetic ? <span className="badge badge--neutral">Synthetic</span> : null}
                </div>
                <p className="finding-statement">{f.statement ?? "—"}</p>
                <p className="muted">
                  {f.region?.district_name ?? "Unknown district"}
                  {f.region?.regency_name ? `, ${f.region.regency_name}` : ""} · {f.evidence_count} evidence item(s)
                  {f.case_id ? (
                    <>
                      {" · "}
                      <Link href={`/cases/${encodeURIComponent(f.case_id)}`}>Case {f.case_id}</Link>
                    </>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
