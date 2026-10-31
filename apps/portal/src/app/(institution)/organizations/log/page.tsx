import "../../../(public)/public.css";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { InstitutionConsole } from "@/components/console/Consoles";
import { DecisionLogView } from "@/components/log/DecisionLog";
import { loadConfig } from "@/lib/config";
import { getT } from "@/lib/i18n/server";
import { ROUTES, signInHref } from "@/lib/routes";
import { sessionToken } from "@/lib/session";
import { listMyOrganizations } from "@/lib/organizations";

// SCR-042 inside the institution console: the console shell (sidebar, identity) stays while reading the log.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("public.logPage.title") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ConsoleLogPage({ searchParams }: { searchParams: SearchParams }) {
  const token = await sessionToken();
  if (!token) redirect(signInHref(ROUTES.institutionLog));
  const mine = await listMyOrganizations(loadConfig(), token);
  if (!mine.ok && (mine.status === 401 || mine.status === null)) redirect(signInHref(ROUTES.institutionLog));
  return (
    <InstitutionConsole organization={mine.ok ? (mine.data[0] ?? null) : null} section="log">
      <DecisionLogView searchParams={searchParams} base={ROUTES.institutionLog} />
    </InstitutionConsole>
  );
}
