"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Navigation link that marks itself with aria-current when its section is open. */
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const current = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link href={href} aria-current={current ? "page" : undefined}>
      {children}
    </Link>
  );
}
