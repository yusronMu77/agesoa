import Link from "next/link";
import type { ReactNode } from "react";
import type { CaseLinks } from "@/lib/case-links";
import { getT } from "@/lib/i18n/server";

/** Breadcrumb of the case pages: the surface's links (`links.crumbs`), then the page's own items (`children`). */
export async function CaseCrumbs({ links, inConsole, children }: { links: CaseLinks; inConsole: boolean; children: ReactNode }) {
  const { t } = await getT();
  return (
    <nav
      aria-label={t(inConsole ? "console.breadcrumb" : "public.report.breadcrumb")}
      className={inConsole ? "breadcrumb" : "pub-crumbs"}
    >
      <ol>
        {links.crumbs.map((crumb) => (
          <li key={crumb.href}>
            <Link href={crumb.href}>{crumb.label}</Link>
          </li>
        ))}
        {children}
      </ol>
    </nav>
  );
}
