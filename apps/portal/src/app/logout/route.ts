import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

/** Sign-out link/button target: clears the session cookie and returns to the home page. */
export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
