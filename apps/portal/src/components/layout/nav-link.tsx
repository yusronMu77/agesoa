"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useActivePath } from "@/hooks/use-active-path.hook";

/** Navigation link that marks itself with aria-current when its section is open. */
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const current = useActivePath(href);
  return (
    <Link href={href} aria-current={current ? "page" : undefined}>
      {children}
    </Link>
  );
}
