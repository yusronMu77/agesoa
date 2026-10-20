import "../../../../(public)/public.css";

import { redirect } from "next/navigation";
import { ValidatorConsole } from "@/components/console/Consoles";
import { DecisionLogEntryView } from "@/components/log/DecisionLogEntry";
import { loadConfig } from "@/lib/config";
import { ROUTES, signInHref } from "@/lib/routes";
import { sessionToken } from "@/lib/session";
import { getMyProfile } from "@/lib/trust";

// SCR-042 inside the validator console: the console shell (sidebar, identity) stays while reading the log.
export const dynamic = "force-dynamic";

export { generateMetadata } from "@/components/log/DecisionLogEntry";

type Params = Promise<{ seq: string }>;

export default async function ConsoleLogEntryPage({ params }: { params: Params }) {
  const token = await sessionToken();
  if (!token) redirect(signInHref(ROUTES.validatorLog));
  const profile = await getMyProfile(loadConfig(), token);
  if (!profile.ok && (profile.status === 401 || profile.status === null)) redirect(signInHref(ROUTES.validatorLog));
  return (
    <ValidatorConsole profile={profile.ok ? profile.data : null} section="log">
      <DecisionLogEntryView params={params} base={ROUTES.validatorLog} />
    </ValidatorConsole>
  );
}
