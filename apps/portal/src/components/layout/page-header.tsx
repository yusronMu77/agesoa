import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Title row of a page or section: the heading block on the left, `aside` (badge, button) on the right.
 * `bare` puts the children directly in the row, for a heading without a description.
 */
export function PageHeader({ children, aside, bare = false }: { children: ReactNode; aside?: ReactNode; bare?: boolean }) {
  return (
    <div className="page-header">
      {bare ? children : <div>{children}</div>}
      {aside}
    </div>
  );
}

/** "← Parent page" link above a page title. */
export function BackLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <p className={className}>
      <Link href={href}>← {children}</Link>
    </p>
  );
}
