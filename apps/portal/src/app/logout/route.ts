import { seeOther } from "@/lib/redirect";
import { SESSION_COOKIE } from "@/lib/session";

/** Sign-out link/button target: clears the session cookie and returns to the home page. */
export async function POST() {
  const response = seeOther("/");
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
