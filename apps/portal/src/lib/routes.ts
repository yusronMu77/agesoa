/**
 * Portal URL structure (DESIGN-BRIEF §1, inventory/screens.md "Rute"): four separate surfaces, each with its own shell
 * and, for validators and institutions, its own sign-in page.
 *
 *   public      `/`, `/temuan/[id]`, `/temuan/[id]/laporan`, `/log`, `/about`, `/status`
 *   validator   `/validator`, `/validator/temuan/[findingId]`, `/validator/daftar`, `/validator/log`, sign-in `/validator/masuk`
 *   institution `/instansi`, `/instansi/[organizationId]`, `/instansi/[organizationId]/riwayat`, `/instansi/log`, sign-in `/instansi/masuk`
 *   operator    `/ops`, sign-in `/login?next=/ops`
 *
 * Kept free of Next.js imports: next.config.ts reads LEGACY_REDIRECTS from here.
 */

export const ROUTES = {
  home: "/",
  log: "/log",
  about: "/about",
  status: "/status",
  case: (caseId: string) => `/temuan/${encodeURIComponent(caseId)}`,
  caseReport: (caseId: string) => `/temuan/${encodeURIComponent(caseId)}/laporan`,
  validator: "/validator",
  validatorDecided: "/validator?filter=decided",
  validatorFinding: (findingId: string) => `/validator/temuan/${encodeURIComponent(findingId)}`,
  validatorRegister: "/validator/daftar",
  validatorSignIn: "/validator/masuk",
  /** The decision log inside the validator console (same log as `/log`, the console shell stays). */
  validatorLog: "/validator/log",
  institution: "/instansi",
  organization: (organizationId: string) => `/instansi/${encodeURIComponent(organizationId)}`,
  organizationHistory: (organizationId: string) => `/instansi/${encodeURIComponent(organizationId)}/riwayat`,
  institutionSignIn: "/instansi/masuk",
  institutionLog: "/instansi/log",
  /** Organisations register after creating an account on their own sign-in page (SCR-063 → SCR-060). */
  institutionRegister: "/instansi/masuk?signup=1",
  ops: "/ops",
  /** The operator keeps the shared sign-in page (not one of the four reader surfaces). */
  opsSignIn: "/login?next=/ops",
  /** Creates an account only: the operator role itself is granted by the environment admin. */
  opsRegister: "/login?next=/ops&signup=1",
} as const;

/**
 * Old paths → new paths, served as permanent 308 redirects by next.config.ts (query strings pass through). `:name`
 * matches one path segment. Order matters: the first matching rule wins.
 */
export const LEGACY_REDIRECTS: readonly { source: string; destination: string }[] = [
  { source: "/dashboard", destination: "/" },
  { source: "/findings/:id", destination: "/temuan/:id" },
  { source: "/cases/:id/report", destination: "/temuan/:id/laporan" },
  { source: "/cases/:id", destination: "/temuan/:id" },
  { source: "/validate", destination: "/validator" },
  { source: "/validate/:findingId", destination: "/validator/temuan/:findingId" },
  { source: "/validators/register", destination: "/validator/daftar" },
  { source: "/organizations", destination: "/instansi" },
  { source: "/organizations/:organizationId/deliveries", destination: "/instansi/:organizationId/riwayat" },
  { source: "/organizations/:organizationId", destination: "/instansi/:organizationId" },
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
 * link): `/validate/F-1?x=1#y` → `/validator/temuan/F-1?x=1#y`. Paths that are already current are returned as is.
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
  if (within(pathname, "/validator")) return "validator";
  if (within(pathname, "/instansi")) return "institution";
  if (within(pathname, "/ops")) return "ops";
  return "public";
}

const SIGN_IN_PAGE: Record<SignInSurface, string> = {
  validator: ROUTES.validatorSignIn,
  institution: ROUTES.institutionSignIn,
  ops: "/login",
  public: "/login",
};

/** The sign-in page of the surface `next` belongs to, returning there afterwards: `/validator/masuk?next=%2Fvalidator`. */
export function signInHref(next: string, extra: Record<string, string> = {}): string {
  const target = canonicalPath(next);
  const query = new URLSearchParams({ next: target, ...extra });
  return `${SIGN_IN_PAGE[surfaceOf(target)]}?${query}`;
}
