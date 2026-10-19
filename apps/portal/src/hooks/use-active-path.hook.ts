"use client";

import { usePathname } from "next/navigation";

/** True when `href` is the open page or one of its sub-pages ("/" matches only the home page). */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function useActivePath(href: string): boolean {
  return isActivePath(usePathname() ?? "/", href);
}
