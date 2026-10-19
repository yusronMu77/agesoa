import Link from "next/link";
import type { ReactNode } from "react";

export interface PageLink {
  href: string;
  label: ReactNode;
}

/** Previous / next links; a side without a link is left out. */
export function Pagination({ label, prev, next }: { label: string; prev?: PageLink | null; next?: PageLink | null }) {
  return (
    <nav className="pagination" aria-label={label}>
      <ul>
        {prev ? (
          <li>
            <Link href={prev.href} rel="prev">
              {prev.label}
            </Link>
          </li>
        ) : null}
        {next ? (
          <li>
            <Link href={next.href} rel="next">
              {next.label}
            </Link>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
