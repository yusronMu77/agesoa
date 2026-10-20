import "../../../../(public)/public.css";

import { redirect } from "next/navigation";
import { InstitutionConsole } from "@/components/console/Consoles";
import { DecisionLogEntryView } from "@/components/log/DecisionLogEntry";
import { loadConfig } from "@/lib/config";
import { ROUTES, signInHref } from "@/lib/routes";
import { sessionToken } from "@/lib/session";
import { listMyOrganizations } from "@/lib/organizations";

// SCR-042 inside the institution console: the console shell (sidebar, identity) stays while reading the log.
export const dynamic = "force-dynamic";

export { generateMetadata } from "@/components/log/DecisionLogEntry";

type Params = Promise<{ seq: string }>;

export default async function ConsoleLogEntryPage({ params }: { params: Params }) {
  const token = await sessionToken();
  if (!token) redirect(signInHref(ROUTES.institutionLog));
  const mine = await listMyOrganizations(loadConfig(), token);
  if (!mine.ok && (mine.status === 401 || mine.status === null)) redirect(signInHref(ROUTES.institutionLog));
  return (
    <InstitutionConsole organization={mine.ok ? (mine.data[0] ?? null) : null} section="log">
      <DecisionLogEntryView params={params} base={ROUTES.institutionLog} />
    </InstitutionConsole>
  );
}
