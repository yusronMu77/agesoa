import { Check, Info, MapPin } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { EvidenceBadge } from "@/components/EvidenceBadge";
import { dashboardContext, findingPage } from "@/lib/dashboard-context";
import { loadConfig } from "@/lib/config";
import { categoryLabel, loadDomainPacks, packName } from "@/lib/domainpacks";
import { formatNumber } from "@/lib/i18n/core";
import { getT } from "@/lib/i18n/server";
import { ROUTES } from "@/lib/routes";
import {
  activeValidators,
  casesPerDistrict,
  countByEvidence,
  distinctAreas,
  EVIDENCE_STATUSES,
  isActiveCase,
  newReportsByCase,
  parseEvidenceFilter,
  rankDistricts,
  rankTrending,
  shortDistrictName,
  TRENDING_DAYS,
} from "@/lib/publicview";
import {
  listCollection,
  type PublicCase,
  type PublicDistrict,
  type PublicFinding,
} from "@/lib/readmodel";
import { getLogForSubjectKind, getLogHead, getLogPage, getRecentLog, type LogEntry } from "@/lib/transparency";
import { AskForm } from "./AskForm";
import { ContextForm } from "./ContextForm";
import { DistrictMap } from "./DistrictMap";
import { FindingCard } from "./FindingCard";
import { LatestLog } from "./LatestLog";
import { count } from "./text";
import { localizedText } from "@/lib/localized";
import { AREA_COOKIE, NEARBY_RADIUS_KM, nearbyCases } from "@/lib/nearby";
import { LocateButton } from "./LocateButton";

const LATEST_LOG = 4;

type SearchParams = Record<string, string | string[] | undefined>;

async function latestEntries(config: ReturnType<typeof loadConfig>): Promise<LogEntry[] | null> {
  const head = await getLogHead(config);
  if (!head.ok) return null;
  const page = await getLogPage(config, { after: Math.max(0, head.data.seq - LATEST_LOG), limit: LATEST_LOG });
  return page.ok ? [...page.data.items].reverse() : null;
}

/**
 * SCR-040 public dashboard, shown on `/` (old `/dashboard` links redirect there): context pickers, the "why" question with key numbers, the
 * district heat map, cases trending in the last 7 days, districts with cases, findings with an evidence-status filter
 * and the latest decision log entries. Every number comes from the public read model or the public log.
 */
export async function PublicDashboard({ basePath, searchParams }: { basePath: string; searchParams: SearchParams }) {
  const { lang, t } = await getT();
  const config = loadConfig();
  const filter = parseEvidenceFilter(searchParams.status);
  const since = new Date(Date.now() - TRENDING_DAYS * 24 * 3600 * 1000).toISOString();

  const [cases, findings, districts, log, recent, validators] = await Promise.all([
    listCollection<PublicCase>(config, "public_cases"),
    listCollection<PublicFinding>(config, "public_findings"),
    listCollection<PublicDistrict>(config, "public_regions"),
    latestEntries(config),
    getRecentLog(config, since),
    getLogForSubjectKind(config, "validator"),
  ]);

  if (!cases.ok || !findings.ok || !districts.ok) {
    return (
      <>
        <h1 className="sr-only">{t("public.dashboard.title")}</h1>
        <section className="card pub-state" aria-labelledby="dash-error" role="alert">
          <h2 id="dash-error">{t("public.error.title")}</h2>
          <p>{t("public.error.body")}</p>
          <a className="button" href={basePath}>
            {t("public.error.retry")}
          </a>
        </section>
      </>
    );
  }

  const packs = await loadDomainPacks(
    config,
    cases.data.map((c) => c.domain ?? "").concat(findings.data.map((f) => f.domain ?? "")),
  );
  // The reader's district ("lokasi Anda", only its code is remembered) sets the default region and "Di sekitar Anda".
  const areaCode = (await cookies()).get(AREA_COOKIE)?.value;
  const area = areaCode ? (districts.data.find((d) => d.district_code === areaCode) ?? null) : null;
  const query = searchParams.region === undefined && area ? { ...searchParams, region: area.regency_name } : searchParams;
  const context = dashboardContext(cases.data, findings.data, districts.data, query);
  const anySynthetic = context.cases.some((c) => c.synthetic) || context.districts.some((d) => d.synthetic);

  const map = casesPerDistrict(context.cases, context.districts);
  const topDistricts = rankDistricts(context.districts, map.perDistrict);
  const trending = recent.ok
    ? rankTrending(context.cases, context.findings, newReportsByCase(recent.data.items, context.cases))
    : null;
  const caseById = new Map(context.cases.map((c) => [c.case_id, c]));
  // "Di sekitar Anda" looks around the reader's district in every region (not only the chosen one).
  const nearby = area ? nearbyCases(area, districts.data, cases.data, findings.data) : [];
  const rawFlag = typeof searchParams.lokasi === "string" ? searchParams.lokasi : null;
  const locationFlag = rawFlag === "outside" || rawFlag === "error" ? rawFlag : null;
  const backQuery = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) if (typeof v === "string" && k !== "lokasi") backQuery.set(k, v);
  const backPath = `${basePath}${backQuery.size ? `?${backQuery}` : ""}`;

  const active = context.cases.filter(isActiveCase);
  const evidence = countByEvidence(context.findings);

  // Strongest evidence first (as the design lists them), then by case.
  const strength = (f: PublicFinding) => (f.status ? EVIDENCE_STATUSES.indexOf(f.status) : -1);
  const sortedFindings = [...context.findings].sort(
    (a, b) => strength(b) - strength(a) || (a.case_id ?? "").localeCompare(b.case_id ?? ""),
  );
  const shown = filter ? sortedFindings.filter((f) => f.status === filter) : sortedFindings;
  const pagination = findingPage(shown, searchParams.page);
  const href = (status: string | null, page = 1) => {
    const query = new URLSearchParams();
    if (context.domain) query.set("domain", context.domain);
    if (context.region) query.set("region", context.region);
    else if (area) query.set("region", ""); // "Semua wilayah" chosen explicitly over the reader's region
    if (status) query.set("status", status);
    if (page > 1) query.set("page", String(page));
    return `${basePath}${query.size ? `?${query}` : ""}#findings-heading`;
  };
  const fmt = (n: number) => formatNumber(lang, n);
  const areaLabel = context.region || t("public.context.allRegions");

  return (
    <div className="pub-dash">
      <h1 className="sr-only">{t("public.dashboard.title")}</h1>
      <ContextForm
        action={basePath}
        label={t("public.context.label")}
        hint={t("public.context.autoApply")}
        applyLabel={t("public.context.apply")}
        status={filter}
        note={anySynthetic ? t("public.context.demoNote") : null}
        selects={[
          {
            name: "domain",
            id: "context-domain",
            label: t("public.context.issueType"),
            value: context.domain,
            options: [
              { value: "", label: t("public.context.issueType.all") },
              ...context.domains.map((domain) => ({ value: domain, label: packName(packs, domain, lang) })),
            ],
          },
          {
            name: "region",
            id: "context-region",
            label: t("public.context.region"),
            value: context.region,
            options: [
              { value: "", label: t("public.context.allRegions") },
              ...context.regions.map((region) => ({
                value: region,
                label:
                  area && region === area.regency_name
                    ? t("common.context.region.yours", { wilayah: region, region })
                    : region,
              })),
            ],
          },
        ]}
      />

      <div className="pub-hero">
        <section className="pub-hero__text" aria-labelledby="hero-title">
          <h2 id="hero-title" className="pub-hero__title">
            {t("public.hero.title")}
          </h2>
          <p className="pub-hero__lead">{t("public.hero.body")}</p>

          <ul className="pub-kpis" aria-label={t("public.kpi.label")} data-testid="dashboard-stats">
            <li className="pub-kpi">
              <span className="pub-kpi__label">{t("public.kpi.cases")}</span>
              <span className="pub-kpi__value">{fmt(active.length)}</span>
              <span className="pub-kpi__sub">{t("public.kpi.cases.sub", { n: fmt(distinctAreas(active)) })}</span>
            </li>
            <li className="pub-kpi">
              <span className="pub-kpi__label">{t("public.kpi.systemic")}</span>
              <span className="pub-kpi__value pub-kpi__value--accent">{fmt(context.findings.length)}</span>
              <span className="pub-kpi__sub">
                {/* A proven finding is also supported by evidence: "supported" counts both. */}
                {t("public.kpi.systemic.sub", { a: fmt(evidence.supported + evidence.proven), b: fmt(evidence.alleged) })}
              </span>
            </li>
            <li className="pub-kpi">
              <span className="pub-kpi__label">{t("public.kpi.validators")}</span>
              <span className="pub-kpi__value">{validators.ok ? fmt(activeValidators(validators.data)) : "—"}</span>
              <span className="pub-kpi__sub">{t("public.kpi.validators.sub")}</span>
            </li>
          </ul>

          <div className="pub-howto">
            <Info aria-hidden size={16} strokeWidth={2} />
            <div>
              <h3>{t("public.evidence.howto.title")}</h3>
              <p>{t("public.evidence.howto.body")}</p>
            </div>
          </div>
        </section>

        <DistrictMap
          t={t}
          districts={context.districts}
          perDistrict={map.perDistrict}
          unmapped={map.unmapped.length}
          anySynthetic={anySynthetic}
        />
      </div>

      <div className="pub-row">
        <section className="pub-trending" aria-labelledby="trending-heading">
          <div className="pub-section-head">
            <h2 id="trending-heading">{t("public.trending.title")}</h2>
            <p>{t("public.trending.sub")}</p>
          </div>
          {!trending ? (
            <p className="pub-empty">{t("public.log.unavailable")}</p>
          ) : trending.length === 0 ? (
            <p className="pub-empty">{t("public.trending.empty")}</p>
          ) : (
            <ol className="pub-highlights">
              {trending.map((r) => {
                const c = r.case;
                const category = c.category ? categoryLabel(packs, c.category, lang) : null;
                const title = r.title ? localizedText(lang, r.title, r.title_i18n) : null;
                const district = c.region?.district_name ?? c.region?.regency_name;
                return (
                  <li key={c.case_id} className="pub-highlight" data-testid="most-reported">
                    <div className="pub-highlight__top">
                      <span className="pub-highlight__rank" aria-label={t("public.trending.rank", { n: r.rank })}>
                        {r.rank}
                      </span>
                      <span className="pub-chip pub-chip--new">
                        {t(r.newReports === 1 ? "public.trending.newReports.one" : "public.trending.newReports.other", {
                          n: fmt(r.newReports),
                        })}
                      </span>
                    </div>
                    <h3 className="pub-highlight__title">
                      <Link href={ROUTES.case(c.case_id)} lang={title?.lang}>
                        {title?.text || category || t("public.findings.case", { id: c.case_id })}
                      </Link>
                    </h3>
                    <p className="pub-highlight__meta">
                      {[title?.text ? category : null, district ? shortDistrictName(district) : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="pub-highlight__foot">
                      <EvidenceBadge status={c.max_finding_status} lang={lang} />
                      <span>{t(c.report_count === 1 ? "public.count.reportsShort.one" : "public.count.reportsShort.other", { n: fmt(c.report_count) })}</span>
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <aside className="pub-nearby" aria-labelledby="nearby-heading">
          <h2 id="nearby-heading">{t("public.nearby.title")}</h2>
          {area ? (
            <>
              <p className="pub-nearby__sub">
                <MapPin aria-hidden size={14} strokeWidth={2} />
                {t("public.nearby.sub", {
                  wilayah: shortDistrictName(area.district_name),
                  region: shortDistrictName(area.district_name),
                  km: fmt(NEARBY_RADIUS_KM),
                })}
              </p>
              {nearby.length === 0 ? (
                <p className="pub-empty">
                  {t("public.nearby.none", {
                    km: fmt(NEARBY_RADIUS_KM),
                    wilayah: shortDistrictName(area.district_name),
                    region: shortDistrictName(area.district_name),
                  })}
                </p>
              ) : (
                <ul className="pub-nearby__list" data-testid="nearby-list">
                  {nearby.map((row) => {
                    const title = row.title ? localizedText(lang, row.title, row.title_i18n) : null;
                    const category = row.case.category ? categoryLabel(packs, row.case.category, lang) : null;
                    return (
                      <li key={row.case.case_id} data-testid="nearby">
                        <span className="pub-nearby__pin" aria-hidden="true">
                          <MapPin size={16} strokeWidth={2} />
                        </span>
                        <span className="pub-nearby__name">
                          <Link className="pub-nearby__title" href={ROUTES.case(row.case.case_id)} lang={title?.lang}>
                            {title?.text || category || t("public.findings.case", { id: row.case.case_id })}
                          </Link>
                          <span className="pub-nearby__meta">
                            {[category, row.status ? t(`common.evidence.${row.status}`) : null].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className="pub-nearby__count">
                          {row.sameArea
                            ? t("public.nearby.sameArea")
                            : t("public.nearby.km", {
                                km: new Intl.NumberFormat(lang === "id" ? "id-ID" : "en-US", {
                                  maximumFractionDigits: 1,
                                  minimumFractionDigits: 1,
                                }).format(row.km),
                              })}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {nearby.some((r) => !r.sameArea) ? <p className="pub-nearby__note">{t("public.nearby.distanceNote")}</p> : null}
            </>
          ) : (
            <>
              <p className="pub-nearby__sub">
                <MapPin aria-hidden size={14} strokeWidth={2} />
                {t("public.nearby.areaSub", { area: areaLabel, n: fmt([...map.perDistrict.values()].filter((n) => n > 0).length) })}
              </p>
              <p className="pub-nearby__intro">{t("public.nearby.noLocation")}</p>
              {topDistricts.length === 0 ? (
                <p className="pub-empty">{t("public.nearby.empty")}</p>
              ) : (
                <ul className="pub-nearby__list">
                  {topDistricts.map(({ district, cases: n }) => (
                    <li key={district.district_code}>
                      <span className="pub-nearby__pin" aria-hidden="true">
                        <MapPin size={16} strokeWidth={2} />
                      </span>
                      <span className="pub-nearby__name">
                        <span className="pub-nearby__title">{shortDistrictName(district.district_name)}</span>
                        <span className="pub-nearby__meta">{district.regency_name}</span>
                      </span>
                      <span className="pub-nearby__count">{count(t, "cases", n)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {locationFlag ? (
            <p className="callout callout--warning pub-nearby__flag" role="status">
              {t(`public.nearby.${locationFlag}`)}
            </p>
          ) : null}
          <div className="pub-nearby__foot">
            <p>{t("public.nearby.privacy")}</p>
            <details className="pub-nearby__change" open={locationFlag !== null || undefined}>
              <summary>{t("public.nearby.change")}</summary>
              <div className="pub-nearby__change-body">
                <LocateButton
                  back={backPath}
                  label={t("public.nearby.useLocation")}
                  busyLabel={t("public.nearby.locating")}
                  deniedText={t("public.nearby.denied")}
                />
                <p className="pub-nearby__note">{t("public.nearby.permission")}</p>
                <form action={ROUTES.location} method="get" className="pub-nearby__pick">
                  <input type="hidden" name="back" value={backPath} />
                  <label htmlFor="nearby-area">{t("public.nearby.pick")}</label>
                  <select id="nearby-area" name="to" defaultValue={area?.district_code ?? ""} required>
                    <option value="" disabled>
                      {t("public.nearby.pickNone")}
                    </option>
                    {[...districts.data]
                      .sort((x, y) => x.district_name.localeCompare(y.district_name))
                      .map((d) => (
                        <option key={d.district_code} value={d.district_code}>
                          {`${shortDistrictName(d.district_name)} · ${d.regency_name}`}
                        </option>
                      ))}
                  </select>
                  <div className="pub-nearby__pick-actions">
                    <button type="submit" className="button">
                      {t("public.nearby.save")}
                    </button>
                    {area ? (
                      <a className="button button--secondary" href={`${ROUTES.location}?to=&back=${encodeURIComponent(backPath)}`}>
                        {t("public.nearby.forget")}
                      </a>
                    ) : null}
                  </div>
                </form>
              </div>
            </details>
          </div>
        </aside>
      </div>

      <section className="card pub-ask" aria-labelledby="ask-heading">
        <h2 id="ask-heading">{t("public.ask.title")}</h2>
        <AskForm t={t} />
      </section>

      <div className="pub-filter">
        <nav className="pub-chips" aria-label={t("public.findings.filter.label")}>
          <span aria-hidden="true">{t("public.findings.filter.label")}</span>
          <ul>
            {[null, ...EVIDENCE_STATUSES].map((s) => {
              const current = s === filter;
              return (
                <li key={s ?? "all"}>
                  <Link className="pub-chip-link" href={href(s)} aria-current={current ? "true" : undefined}>
                    {current ? <Check aria-hidden size={14} strokeWidth={2} /> : null}
                    {s ? t(`common.evidence.${s}`) : t("public.findings.filter.all")}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <p>{count(t, "findings", shown.length)}</p>
      </div>

      <div className="pub-row pub-row--findings">
        <section className="pub-findings" aria-labelledby="findings-heading">
          <h2 id="findings-heading" className="sr-only">
            {t("public.findings.title")}
          </h2>
          {shown.length === 0 ? (
            filter ? (
              <div className="card pub-state">
                <h3>{t("public.findings.emptyFilter")}</h3>
                <p>{t("public.findings.emptyFilterBody")}</p>
                <Link className="button" href={href(null)}>
                  {t("public.findings.changeFilter")}
                </Link>
              </div>
            ) : (
              <p className="pub-empty">{t("public.findings.empty")}</p>
            )
          ) : (
            <ul className="finding-list" data-testid="finding-list">
              {pagination.items.map((f) => {
                const c = f.case_id ? caseById.get(f.case_id) : undefined;
                return (
                  <FindingCard
                    key={f.finding_id}
                    t={t}
                    lang={lang}
                    finding={f}
                    category={c?.category ? categoryLabel(packs, c.category, lang) : null}
                    reports={c?.report_count ?? null}
                    hasReport={Boolean(c?.audit_report)}
                  />
                );
              })}
            </ul>
          )}
          {pagination.pages > 1 ? (
            <nav className="pub-pagination" aria-label={t("public.findings.pagination")}>
              {pagination.page > 1 ? <Link href={href(filter, pagination.page - 1)}>{t("public.findings.previous")}</Link> : <span />}
              <span>{t("public.findings.page", { page: pagination.page, pages: pagination.pages })}</span>
              {pagination.page < pagination.pages ? <Link href={href(filter, pagination.page + 1)}>{t("public.findings.next")}</Link> : <span />}
            </nav>
          ) : null}
        </section>

        <LatestLog t={t} lang={lang} entries={log} />
      </div>
    </div>
  );
}
