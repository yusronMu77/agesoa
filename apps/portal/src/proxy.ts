import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
import { clerkEnabled, clerkPublishableKey } from "@/lib/clerk-config";

const clerk = clerkMiddleware({ publishableKey: clerkPublishableKey() });

// Public reading remains anonymous. Existing service roles are verified by Identity Platform.
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  return clerkEnabled() ? clerk(request, event) : NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|webmanifest)).*)", "/(api|trpc)(.*)"],
};
