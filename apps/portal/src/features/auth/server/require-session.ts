import { redirect } from "next/navigation";
import { ROUTES } from "@/configs/routes.config";
import type { FetchResult } from "@/services/http/fetch-json";
import { sessionToken } from "./session";

/**
 * The session token of a signed-in page or server action; without one the caller goes to the sign-in page and
 * comes back to `returnTo` afterwards. Pages are gated by token presence only: the services enforce the roles.
 */
export async function requireSession(returnTo: string): Promise<string> {
  const token = await sessionToken();
  if (!token) redirect(ROUTES.login(returnTo));
  return token;
}

/** Sends the caller to sign in again when the service refused the token (401) or could not be reached. */
export function redirectWhenSignedOut(result: FetchResult<unknown>, returnTo: string, statuses: (number | null)[] = [401, null]) {
  if (!result.ok && statuses.includes(result.status)) redirect(ROUTES.login(returnTo));
}
