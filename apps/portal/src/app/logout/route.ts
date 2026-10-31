import { seeOther } from "@/lib/redirect";
import { SESSION_COOKIE } from "@/lib/session";

/**
 * Sign-out button target: clears the session cookie, then goes to `?to=` (a same-site path: the console's own
 * sign-in page, e.g. `/validators/login`) or the home page.
 */
export async function POST(request: Request) {
  const to = new URL(request.url).searchParams.get("to");
  const response = seeOther(to ?? "/");
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
