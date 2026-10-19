import { ROUTES } from "@/configs/routes.config";
import { SESSION_COOKIE } from "@/features/auth/server/session";
import { seeOther } from "@/lib/redirect";

/** Sign-out link/button target: clears the session cookie and returns to the home page. */
export async function POST() {
  const response = seeOther(ROUTES.home);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
