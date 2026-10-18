import type { PublicCase, PublicDistrict, PublicFinding } from "./readmodel";

type Query = Record<string, string | string[] | undefined>;
export function dashboardContext(cases: PublicCase[], findings: PublicFinding[], districts: PublicDistrict[], query: Query) {
  const domains = [...new Set([...cases, ...findings].map((item) => item.domain).filter((v): v is string => Boolean(v)))].sort();
  const regions = [...new Set([...cases, ...findings].map((item) => item.region?.regency_name).concat(districts.map((d) => d.regency_name)).filter((v): v is string => Boolean(v)))].sort();
  const domain = typeof query.domain === "string" && domains.includes(query.domain) ? query.domain : "";
  const region = typeof query.region === "string" && regions.includes(query.region) ? query.region : "";
  const caseById = new Map(cases.map((item) => [item.case_id, item]));
  return {
    domain, region, domains, regions,
    cases: cases.filter((item) => (!domain || item.domain === domain) && (!region || item.region?.regency_name === region)),
    findings: findings.filter((item) => {
      const parent = item.case_id ? caseById.get(item.case_id) : undefined;
      return (!domain || (item.domain ?? parent?.domain) === domain) && (!region || (item.region?.regency_name ?? parent?.region?.regency_name) === region);
    }),
    districts: districts.filter((item) => !region || item.regency_name === region),
  };
}

export function findingPage<T>(items: T[], raw: string | string[] | undefined, size = 6) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const requested = typeof raw === "string" && /^[1-9]\d*$/.test(raw) ? Number(raw) : 1;
  const page = Math.min(pages, Number.isSafeInteger(requested) ? requested : 1);
  return { page, pages, items: items.slice((page - 1) * size, page * size) };
}
