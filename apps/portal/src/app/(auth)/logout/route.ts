import { NextResponse } from "next/server";
import { ROUTES } from "@/configs/routes.config";
import { SESSION_COOKIE } from "@/features/auth/server/session";

/** Sign-out link/button target: clears the session cookie and returns to the home page. */
export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL(ROUTES.home, request.url), 303);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
