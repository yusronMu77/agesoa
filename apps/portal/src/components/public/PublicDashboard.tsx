import { Check, Info, MapPin } from "lucide-react";
import Link from "next/link";
import { EvidenceBadge } from "@/components/EvidenceBadge";
import { dashboardContext, findingPage } from "@/lib/dashboard-context";
import { loadConfig } from "@/lib/config";
import { categoryLabel, loadDomainPacks, packName } from "@/lib/domainpacks";
import { formatDateTime, formatNumber } from "@/lib/i18n/core";
import { getT } from "@/lib/i18n/server";
import {
  casesPerDistrict,
  countByEvidence,
  distinctAreas,
  EVIDENCE_STATUSES,
  isActiveCase,
  parseEvidenceFilter,
  rankDistricts,
  rankMostReported,
} from "@/lib/publicview";
import {
  getDocument,
  listCollection,
  type PublicCase,
  type PublicDistrict,
  type PublicFinding,
  type PublicStats,
} from "@/lib/readmodel";
import { getLogHead, getLogPage, type LogEntry } from "@/lib/transparency";
import { DistrictMap } from "./DistrictMap";
import { FindingCard } from "./FindingCard";
import { LatestLog } from "./LatestLog";
import { count } from "./text";
import { localizedText } from "@/lib/localized";

const LATEST_LOG = 5;

type SearchParams = Record<string, string | string[] | undefined>;

async function latestEntries(config: ReturnType<typeof loadConfig>): Promise<LogEntry[] | null> {
  const head = await getLogHead(config);
  if (!head.ok) return null;
  const page = await getLogPage(config, { after: Math.max(0, head.data.seq - LATEST_LOG), limit: LATEST_LOG });
  return page.ok ? [...page.data.items].reverse() : null;
}

/**
 * SCR-040 public dashboard, shown on `/` and `/dashboard`: context, the "why" question with key numbers, the district
 * heat map, the most reported cases, findings with an evidence-status filter and the latest decision log entries.
 * Every number comes from the public read model or the public log; nothing is estimated.
 */
export async function PublicDashboard({ basePath, searchParams }: { basePath: string; searchParams: SearchParams }) {
  const { lang, t } = await getT();
  const config = loadConfig();
  const filter = parseEvidenceFilter(searchParams.status);

  const [cases, findings, districts, stats, log] = await Promise.all([
    listCollection<PublicCase>(config, "public_cases"),
    listCollection<PublicFinding>(config, "public_findings"),
    listCollection<PublicDistrict>(config, "public_regions"),
    getDocument<PublicStats>(config, "public_stats/summary"),
    latestEntries(config),
  ]);

  if (!cases.ok || !findings.ok || !districts.ok) {
    return (
      <>
        <h1>{t("public.dashboard.title")}</h1>
        <section className="callout callout--error" aria-labelledby="dash-error">
          <h2 id="dash-error">{t("public.error.title")}</h2>
          <p>{t("public.error.body")}</p>
        </section>
      </>
    );
  }

  const packs = await loadDomainPacks(
    config,
    cases.data.map((c) => c.domain ?? "").concat(findings.data.map((f) => f.domain ?? "")),
  );
  const context = dashboardContext(cases.data, findings.data, districts.data, searchParams);
  const anySynthetic = context.cases.some((c) => c.synthetic) || context.districts.some((d) => d.synthetic);

  const map = casesPerDistrict(context.cases, context.districts);
  const topDistricts = rankDistricts(context.districts, map.perDistrict);
  const mostReported = rankMostReported(context.cases, context.findings);
  const caseById = new Map(context.cases.map((c) => [c.case_id, c]));

  const active = context.cases.filter(isActiveCase);
  const evidence = countByEvidence(context.findings);
  const approved = context.findings.filter((f) => f.validation?.outcome === "approved").length;
  const returned = context.findings.filter((f) => f.validation?.outcome === "rejected").length;
  const decisions = context.findings.reduce((n, f) => n + (f.validation?.decisions.length ?? 0), 0);

  const sortedFindings = [...context.findings].sort((a, b) => (a.case_id ?? "").localeCompare(b.case_id ?? ""));
  const shown = filter ? sortedFindings.filter((f) => f.status === filter) : sortedFindings;
  const pagination = findingPage(shown, searchParams.page);
  const summary = stats.ok ? stats.data : null;
  const href = (status: string | null, page = 1) => {
    const query = new URLSearchParams();
    if (context.domain) query.set("domain", context.domain);
    if (context.region) query.set("region", context.region);
    if (status) query.set("status", status);
    if (page > 1) query.set("page", String(page));
    return `${basePath}${query.size ? `?${query}` : ""}#findings-heading`;
  };
  const fmt = (n: number) => formatNumber(lang, n);

  return (
    <div className="pub-dash">
      <header className="pub-dash__head">
        <h1 className="pub-page-eyebrow">{t("public.dashboard.title")}</h1>
        <form className="pub-context" action={basePath} method="get" aria-label={t("public.context.label")}>
          <label className="pub-context__box">
            <span>{t("public.context.issueType")}</span>
            <select name="domain" defaultValue={context.domain}>
              <option value="">{t("public.context.issueType.all")}</option>
              {context.domains.map((domain) => <option key={domain} value={domain}>{packName(packs, domain, lang)}</option>)}
            </select>
          </label>
          <label className="pub-context__box">
            <span>{t("public.context.region")}</span>
            <select name="region" defaultValue={context.region}>
              <option value="">{t("public.context.allRegions")}</option>
              {context.regions.map((region) => <option key={region} value={region}>{region}</option>)}
            </select>
          </label>
          {filter ? <input type="hidden" name="status" value={filter} /> : null}
          <button className="button button--secondary" type="submit">{t("public.context.apply")}</button>
          {anySynthetic ? <p className="muted small pub-context__note">{t("public.context.demoNote")}</p> : null}
        </form>
      </header>

      <div className="pub-hero">
        <section className="pub-hero__text" aria-labelledby="hero-title">
          <h2 id="hero-title" className="pub-hero__title">
            {t("public.hero.title")}
          </h2>
          <p className="lead">{t("public.hero.body")}</p>

          <ul className="stat-grid pub-kpis" aria-label={t("public.kpi.label")} data-testid="dashboard-stats">
            <li className="card">
              <span className="pub-kpi__label">{t("public.kpi.cases")}</span>
              <span className="stat-value">{fmt(active.length)}</span>
              <span className="muted small">
                {t("public.kpi.cases.sub", { total: fmt(context.cases.length), n: fmt(distinctAreas(active)) })}
              </span>
            </li>
            <li className="card">
              <span className="pub-kpi__label">{t("public.kpi.findings")}</span>
              <span className="stat-value">{fmt(context.findings.length)}</span>
              <span className="muted small">
                {t("public.kpi.findings.sub", {
                  p: fmt(evidence.proven),
                  s: fmt(evidence.supported),
                  a: fmt(evidence.alleged),
                })}
              </span>
            </li>
            <li className="card">
              <span className="pub-kpi__label">{t("public.kpi.validated")}</span>
              <span className="stat-value">{fmt(approved)}</span>
              <span className="muted small">{t("public.kpi.validated.sub", { n: fmt(decisions), r: fmt(returned) })}</span>
            </li>
          </ul>

          <div className="callout pub-howto">
            <Info aria-hidden size={18} strokeWidth={2} />
            <div>
              <h3>{t("public.evidence.howto.title")}</h3>
              <p>{t("public.evidence.howto.body")}</p>
            </div>
          </div>
          <p className="muted small">
            {t("public.dashboard.privacy")}{" "}
            {summary ? t("public.dashboard.updated", { time: formatDateTime(lang, summary.updated_at) }) : null}
          </p>
        </section>

        <DistrictMap
          t={t}
          districts={context.districts}
          perDistrict={map.perDistrict}
          max={map.max}
          unmapped={map.unmapped.length}
          anySynthetic={anySynthetic}
        />
      </div>

      <div className="pub-row">
        <section className="pub-trending" aria-labelledby="trending-heading">
          <div className="pub-section-head">
            <h2 id="trending-heading">{t("public.trending.title")}</h2>
            <p className="muted small">{t("public.trending.sub")}</p>
          </div>
          {mostReported.length === 0 ? (
            <p className="pub-empty">{t("public.trending.empty")}</p>
          ) : (
            <ol className="pub-highlights">
              {mostReported.map((r) => {
                const c = r.case;
                const category = c.category ? categoryLabel(packs, c.category, lang) : null;
                const shown = r.title ? localizedText(lang, r.title, r.title_i18n) : null;
                const title = shown?.text || category || t("public.findings.case", { id: c.case_id });
                return (
                  <li key={c.case_id} className="card pub-highlight" data-testid="most-reported">
                    <div className="pub-highlight__top">
                      <span className="pub-highlight__rank" aria-label={t("public.trending.rank", { n: r.rank })}>
                        {r.rank}
                      </span>
                      <span className="pub-chip pub-chip--accent">{count(t, "reports", c.report_count)}</span>
                    </div>
                    <h3 className="pub-highlight__title">
                      <Link href={`/cases/${encodeURIComponent(c.case_id)}`} lang={shown?.lang}>
                        {title}
                      </Link>
                    </h3>
                    <p className="muted small">
                      {[r.title ? category : null, c.region?.district_name ?? c.region?.regency_name]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="pub-highlight__foot">
                      <EvidenceBadge status={c.max_finding_status} lang={lang} />
                      {r.findings.length > 0 ? (
                        <span className="muted small">{count(t, "findings", r.findings.length)}</span>
                      ) : null}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <aside className="card pub-nearby" aria-labelledby="nearby-heading">
          <h2 id="nearby-heading">{t("public.nearby.title")}</h2>
          <p className="muted small">{t("public.nearby.noLocation")}</p>
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
                    {district.district_name}
                    <span className="muted small">{district.regency_name}</span>
                  </span>
                  <span className="pub-nearby__count">{count(t, "cases", n)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">{t("public.nearby.privacy")}</p>
        </aside>
      </div>

      <div className="pub-row pub-row--findings">
        <section className="pub-findings" aria-labelledby="findings-heading">
          <div className="pub-section-head">
            <h2 id="findings-heading">{t("public.findings.title")}</h2>
            <p className="muted small">{t("public.findings.note")}</p>
          </div>
          <div className="pub-filter">
            <nav className="pub-chips" aria-label={t("public.findings.filter.label")}>
              <span className="muted small" aria-hidden="true">
                {t("public.findings.filter.label")}
              </span>
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
            <p className="muted small">
              {count(t, "findings", shown.length)}
            </p>
          </div>
          {shown.length === 0 ? (
            <p className="pub-empty">{filter ? t("public.findings.emptyFilter") : t("public.findings.empty")}</p>
          ) : (
            <ul className="finding-list" data-testid="finding-list">
              {pagination.items.map((f) => {
                const c = f.case_id ? caseById.get(f.case_id) : undefined;
                const meta = c
                  ? [c.category ? categoryLabel(packs, c.category, lang) : null, count(t, "reports", c.report_count)]
                      .filter(Boolean)
                      .join(" · ")
                  : null;
                return (
                  <FindingCard
                    key={f.finding_id}
                    t={t}
                    lang={lang}
                    finding={f}
                    meta={meta}
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
