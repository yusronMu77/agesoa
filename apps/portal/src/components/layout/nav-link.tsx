"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useActivePath } from "@/hooks/use-active-path.hook";

/** Header link (Penpot `Tautan nav`): marked with aria-current when its section is open; the underline repeats it. */
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const current = useActivePath(href);
  return (
    <Link href={href} className="nav-link" aria-current={current ? "page" : undefined}>
      {children}
    </Link>
  );
}
