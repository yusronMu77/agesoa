"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { NavItem } from "@agesoa/ui/components/nav-item";
import { useActivePath } from "@/hooks/use-active-path.hook";

/** Navigation link that marks itself with aria-current when its section is open. */
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const current = useActivePath(href);
  return (
    <NavItem tone="ink" render={<Link href={href} aria-current={current ? "page" : undefined} />}>
      {children}
    </NavItem>
  );
}
