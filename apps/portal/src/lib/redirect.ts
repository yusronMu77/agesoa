import { NextResponse } from "next/server";
import { canonicalPath, ROUTES, type SignInSurface, surfaceOf } from "./routes";

/**
 * 303 See Other to a same-site path, with a RELATIVE Location. Behind a proxy or in the container the request URL is
 * the server's own bind address (http://0.0.0.0:8080), so an absolute URL built from `request.url` sends the browser
 * to an address it cannot reach; a relative Location keeps whatever host the reader used.
 */
export function seeOther(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: safePath(path) } });
}

/** Only same-site paths: never an open redirect (`//host`, `/\host`, absolute URLs fall back to `/`). */
export function safePath(path: string | null | undefined): string {
  return path && path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/";
}

/** Where each sign-in page goes when `next` is missing or points elsewhere. */
const SURFACE_HOME: Record<SignInSurface, string> = {
  validator: ROUTES.validator,
  institution: ROUTES.institution,
  ops: ROUTES.ops,
  public: ROUTES.home,
};

/**
 * Allow-list for the `next` parameter of a sign-in page: a same-site path (safePath), moved to its current route
 * (old links such as `/validator/temuan/F-1` → `/validators/findings/F-1`), and inside the sign-in page's own surface, so the
 * validator sign-in never leads into the institution dashboard and vice versa. Anything else → the surface's home.
 * The public sign-in (header link) may return to any public page.
 */
export function signInTarget(raw: string | null | undefined, surface: SignInSurface): string {
  const path = safePath(raw);
  if (path === "/" && raw !== "/") return SURFACE_HOME[surface];
  const target = canonicalPath(path);
  return surfaceOf(target) === surface ? target : SURFACE_HOME[surface];
}

type Params = Record<string, string | string[] | undefined>;

/**
 * The shared `/login` page: validator and institution targets moved to their own sign-in pages (DESIGN-BRIEF §1),
 * so `/login?next=/validators…` → `/validators/login?next=…` and `/login?next=/organizations…` → `/organizations/login?next=…`
 * (other query values kept, `next` moved to its current route). `/login` without `next` → the validator sign-in.
 * The operator (`next=/ops…`) and the public header sign-in stay on `/login`.
 */
export function resolveLogin(params: Params): { redirect: string } | { surface: "ops" | "public"; next: string } {
  const raw = typeof params.next === "string" ? params.next : undefined;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (typeof value === "string" && key !== "next") query.set(key, value);
  if (raw === undefined) {
    const rest = query.toString();
    return { redirect: rest ? `${ROUTES.validatorSignIn}?${rest}` : ROUTES.validatorSignIn };
  }
  const target = canonicalPath(safePath(raw));
  const surface = surfaceOf(target);
  if (surface === "validator" || surface === "institution") {
    const page = surface === "validator" ? ROUTES.validatorSignIn : ROUTES.institutionSignIn;
    return { redirect: `${page}?${new URLSearchParams({ next: target, ...Object.fromEntries(query) })}` };
  }
  return { surface, next: target };
}
