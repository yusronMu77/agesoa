"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const within = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

/** Navigation link that marks itself with aria-current when its section (or one of `also`) is open. */
export function NavLink({
  href,
  also = [],
  className,
  children,
}: {
  href: string;
  also?: string[];
  className?: string;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  const current = [href, ...also].some((h) => within(pathname, h));
  return (
    <Link href={href} className={className} aria-current={current ? "page" : undefined}>
      {children}
    </Link>
  );
}
