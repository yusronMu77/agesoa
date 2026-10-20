import "../../../(public)/public.css";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ValidatorConsole } from "@/components/console/Consoles";
import { DecisionLogView } from "@/components/log/DecisionLog";
import { loadConfig } from "@/lib/config";
import { getT } from "@/lib/i18n/server";
import { ROUTES, signInHref } from "@/lib/routes";
import { sessionToken } from "@/lib/session";
import { getMyProfile } from "@/lib/trust";

// SCR-042 inside the validator console: the console shell (sidebar, identity) stays while reading the log.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("public.logPage.title") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ConsoleLogPage({ searchParams }: { searchParams: SearchParams }) {
  const token = await sessionToken();
  if (!token) redirect(signInHref(ROUTES.validatorLog));
  const profile = await getMyProfile(loadConfig(), token);
  if (!profile.ok && (profile.status === 401 || profile.status === null)) redirect(signInHref(ROUTES.validatorLog));
  return (
    <ValidatorConsole profile={profile.ok ? profile.data : null} section="log">
      <DecisionLogView searchParams={searchParams} base={ROUTES.validatorLog} />
    </ValidatorConsole>
  );
}
