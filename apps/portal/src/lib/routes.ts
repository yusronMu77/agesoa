/**
 * Portal URL structure (DESIGN-BRIEF §1, inventory/screens.md "Rute"): four separate surfaces, each with its own shell
 * and, for validators and organizations, its own sign-in page. Canonical URL segments are English; the selected UI
 * language never changes a URL.
 *
 *   public       `/`, `/cases/[id]`, `/cases/[id]/report`, `/ask`, `/log`, `/about`, `/status`
 *   validator    `/validators`, `/validators/findings/[findingId]`, `/validators/register`, `/validators/log`,
 *                sign-in `/validators/login`
 *   organization `/organizations`, `/organizations/[organizationId]`, `/organizations/[organizationId]/deliveries`,
 *                `/organizations/log`, sign-in `/organizations/login`
 *   operator     `/ops`, sign-in `/ops/login`
 *
 * Every console signs in at `/<surface>/login`; `/login` is the public header sign-in only.
 *
 * Kept free of Next.js imports: next.config.ts reads LEGACY_REDIRECTS from here.
 */

export const ROUTES = {
  home: "/",
  log: "/log",
  logEntry: (seq: number | string) => `/log/${encodeURIComponent(String(seq))}`,
  about: "/about",
  status: "/status",
  /** Section root of the case pages (no index page: the dashboard lists the cases). */
  cases: "/cases",
  case: (caseId: string) => `/cases/${encodeURIComponent(caseId)}`,
  caseReport: (caseId: string) => `/cases/${encodeURIComponent(caseId)}/report`,
  /** Public question about the findings (`?q=`), answered from validated findings only. */
  ask: "/ask",
  validator: "/validators",
  validatorDecided: "/validators?filter=decided",
  validatorFinding: (findingId: string) => `/validators/findings/${encodeURIComponent(findingId)}`,
  validatorRegister: "/validators/register",
  validatorSignIn: "/validators/login",
  /** The decision log inside the validator console (same log as `/log`, the console shell stays). */
  validatorLog: "/validators/log",
  institution: "/organizations",
  organization: (organizationId: string) => `/organizations/${encodeURIComponent(organizationId)}`,
  organizationHistory: (organizationId: string) => `/organizations/${encodeURIComponent(organizationId)}/deliveries`,
  institutionSignIn: "/organizations/login",
  institutionLog: "/organizations/log",
  /** Organizations register after creating an account on their own sign-in page (SCR-063 → SCR-060). */
  institutionRegister: "/organizations/login?signup=1",
  ops: "/ops",
  /** A section of the operator page (`#events`, `#outbox`, `#demo`). */
  opsSection: (section: string) => `/ops#${section}`,
  /** The public header sign-in (old `/login?next=…` links for a console move to that console's sign-in page). */
  signIn: "/login",
  opsSignIn: "/ops/login",
  /** Creates an account only: the operator role itself is granted by the environment admin. */
  opsRegister: "/ops/login?signup=1",
  signOut: "/logout",
  /** Language picker form target (sets the language cookie, the URL stays). */
  language: "/lang",
  /** "Near you" district (SCR-040): GET chooses or forgets a district, POST turns a point into a district. */
  location: "/location",
} as const;

/**
 * Old paths → current paths, served as permanent 308 redirects by next.config.ts (query strings pass through).
 * `:name` matches one path segment. Order matters: the first matching rule wins, so fixed segments (`login`, `log`)
 * come before a `:id` in the same position. Two generations of old paths: the first English routes (before the
 * surface split) and the Indonesian routes of the surface split (before #157).
 */
export const LEGACY_REDIRECTS: readonly { source: string; destination: string }[] = [
  { source: "/dashboard", destination: "/" },
  { source: "/findings/:id", destination: "/cases/:id" },
  { source: "/validate", destination: "/validators" },
  { source: "/validate/:findingId", destination: "/validators/findings/:findingId" },
  { source: "/temuan/:id/laporan", destination: "/cases/:id/report" },
  { source: "/temuan/:id", destination: "/cases/:id" },
  { source: "/validator", destination: "/validators" },
  { source: "/validator/masuk", destination: "/validators/login" },
  { source: "/validator/daftar", destination: "/validators/register" },
  { source: "/validator/log", destination: "/validators/log" },
  { source: "/validator/log/:seq", destination: "/validators/log/:seq" },
  { source: "/validator/temuan/:findingId", destination: "/validators/findings/:findingId" },
  { source: "/instansi", destination: "/organizations" },
  { source: "/instansi/masuk", destination: "/organizations/login" },
  { source: "/instansi/log", destination: "/organizations/log" },
  { source: "/instansi/log/:seq", destination: "/organizations/log/:seq" },
  { source: "/instansi/:organizationId/riwayat", destination: "/organizations/:organizationId/deliveries" },
  { source: "/instansi/:organizationId", destination: "/organizations/:organizationId" },
  { source: "/lokasi", destination: "/location" },
];

function matchRule(pathname: string, source: string, destination: string): string | null {
  const have = pathname.split("/");
  const want = source.split("/");
  if (have.length !== want.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < want.length; i++) {
    if (want[i].startsWith(":")) {
      if (!have[i]) return null;
      params[want[i].slice(1)] = have[i];
    } else if (want[i] !== have[i]) {
      return null;
    }
  }
  return destination.replace(/:(\w+)/g, (_, name: string) => params[name]);
}

/**
 * The current path for a same-site path that may still use an old route (e.g. a `next=` parameter from an old
 * link): `/validator/temuan/F-1?x=1#y` → `/validators/findings/F-1?x=1#y`. Paths that are already current are returned as is.
 */
export function canonicalPath(path: string): string {
  const cut = path.search(/[?#]/);
  const pathname = cut === -1 ? path : path.slice(0, cut);
  const rest = cut === -1 ? "" : path.slice(cut);
  const trimmed = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  for (const { source, destination } of LEGACY_REDIRECTS) {
    const hit = matchRule(trimmed, source, destination);
    if (hit !== null) return hit + rest;
  }
  return path;
}

export type SignInSurface = "validator" | "institution" | "ops" | "public";

const within = (pathname: string, root: string) => pathname === root || pathname.startsWith(`${root}/`);

/** Which surface a (canonical) path belongs to, i.e. which sign-in page leads to it. */
export function surfaceOf(path: string): SignInSurface {
  const pathname = path.split(/[?#]/)[0];
  if (within(pathname, ROUTES.validator)) return "validator";
  if (within(pathname, ROUTES.institution)) return "institution";
  if (within(pathname, ROUTES.ops)) return "ops";
  return "public";
}

const SIGN_IN_PAGE: Record<SignInSurface, string> = {
  validator: ROUTES.validatorSignIn,
  institution: ROUTES.institutionSignIn,
  ops: ROUTES.opsSignIn,
  public: ROUTES.signIn,
};

/** The sign-in page of the surface `next` belongs to, returning there afterwards: `/validators/login?next=%2Fvalidators`. */
export function signInHref(next: string, extra: Record<string, string> = {}): string {
  const target = canonicalPath(next);
  const query = new URLSearchParams({ next: target, ...extra });
  return `${SIGN_IN_PAGE[surfaceOf(target)]}?${query}`;
}
