import { isLang, LANG_COOKIE } from "@/lib/i18n/core";
import { safePath, seeOther } from "@/lib/redirect";

/**
 * Language picker target (a plain link, so it works without JavaScript and in read-only smoke runs):
 * `/lang?to=en&back=/log` remembers the choice in a cookie for a year and returns to the page.
 */
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const to = params.get("to");
  const response = seeOther(safePath(params.get("back")));
  if (isLang(to)) {
    response.cookies.set(LANG_COOKIE, to, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  return response;
}
