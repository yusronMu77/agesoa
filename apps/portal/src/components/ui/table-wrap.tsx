import type { ReactNode } from "react";

/**
 * Scroll container for a wide table: a focusable, named region so keyboard users can scroll it.
 * Name it with `label` or with `labelledBy` (id of the caption or heading).
 */
export function TableWrap({ label, labelledBy, children }: { label?: string; labelledBy?: string; children: ReactNode }) {
  return (
    <div className="table-wrap" role="region" aria-label={label} aria-labelledby={labelledBy} tabIndex={0}>
      {children}
    </div>
  );
}
