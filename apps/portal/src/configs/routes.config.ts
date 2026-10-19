/**
 * Every portal path in one place. Pages, links, redirects and server actions build URLs only through ROUTES,
 * so moving a page is a change here plus a folder move inside its route group.
 *
 * Route groups in src/app follow the surfaces of the design inventory (agesoa-uiux inventory/screens.md):
 *
 *   (public)        no account        dashboard, case, audit report, decision log, status
 *   (auth)          sign-in/out
 *   (validator)     validators        queue, finding decision, registration
 *   (organization)  newsroom/agency   registration, DNS check, staff confirmation, integration
 *   (operator)      operators         agents and events, demo reset
 *
 * Planned paths (stage 2, after submission; old paths will answer with a 308 redirect):
 *
 *   SCR-040 public dashboard          /dashboard                → /
 *   (what AGESOA is)                  /                         → /tentang
 *   SCR-041/043 case + audit report   /cases/[id], …/report     → /kasus/[caseId], /kasus/[caseId]/laporan
 *   SCR-042 decision log              /log, /log/[seq]            (unchanged)
 *   SCR-023 validator sign-in         /login                    → /validator/masuk
 *   SCR-022 validation queue          /validate                 → /validator
 *   SCR-020 finding decision          /validate/[id]            → /validator/temuan/[findingId]
 *   SCR-021, 024–026 registration     /validators/register      → /validator/daftar
 *   SCR-063 organization sign-in      /login?next=/organizations → /instansi/masuk
 *   SCR-060, 064–065 registration     /organizations            → /instansi/daftar
 *   SCR-061/062 org dashboards        /organizations/[id]       → /instansi/[organizationId]
 *   SCR-080/081 agency SIM            —                         → /sim/* (reserved)
 *   SCR-090 operations                /ops                        (unchanged)
 */

const id = (value: string) => encodeURIComponent(value);

export const ROUTES = {
  home: "/",

  // (public)
  dashboard: "/dashboard",
  case: (caseId: string) => `/cases/${id(caseId)}`,
  caseReport: (caseId: string) => `/cases/${id(caseId)}/report`,
  log: "/log",
  logPage: (after: number) => (after > 0 ? `/log?after=${after}` : "/log"),
  logEntry: (seq: number) => `/log/${seq}`,
  status: "/status",

  // (auth): `next` stays readable in the address bar (/login?next=/validate)
  login: (next?: string) => (next ? `/login?next=${next}` : "/login"),
  logout: "/logout",

  // (validator)
  validate: "/validate",
  validateFinding: (findingId: string) => `/validate/${id(findingId)}`,
  validatorRegister: "/validators/register",

  // (organization)
  organizations: "/organizations",
  organization: (organizationId: string) => `/organizations/${id(organizationId)}`,

  // (operator)
  ops: "/ops",

  // route handlers
  api: {
    healthz: "/api/healthz",
    session: "/api/session",
    status: "/api/status",
  },
} as const;

/** Where the sign-in page sends a caller without `?next=`. */
export const DEFAULT_SIGNED_IN_ROUTE = ROUTES.validate;

/** `path?key=value&…` with every value percent-encoded; undefined values are left out. */
export function withQuery(path: string, query: Record<string, string | number | undefined>): string {
  const pairs = Object.entries(query)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`);
  return pairs.length ? `${path}?${pairs.join("&")}` : path;
}

/** An internal path to return to after sign-in; anything else (absolute or protocol-relative URL) is refused. */
export function safeNextPath(raw: unknown, fallback: string = DEFAULT_SIGNED_IN_ROUTE): string {
  return typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : fallback;
}
