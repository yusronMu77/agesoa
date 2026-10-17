import type { Metadata } from "next";
import { ROUTES } from "@/configs/routes.config";
import { requireSession } from "@/features/auth/server/require-session";
import { loadFindingForDecision } from "@/features/validation/server/load-validation";
import { ValidateFindingView, ValidationUnavailableView } from "@/features/validation/views/validate-finding.view";
import { type PageProps, routeParam, stringParam } from "@/lib/page-props";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Validate finding" };

export default async function ValidateFindingPage({ params, searchParams }: PageProps<{ findingId: string }>) {
  const findingId = await routeParam(params, "findingId");
  const token = await requireSession(ROUTES.validateFinding(findingId));
  const data = await loadFindingForDecision(token, findingId);
  if (!data.ok) return <ValidationUnavailableView error={data.error} />;
  return <ValidateFindingView {...data} error={stringParam((await searchParams).error)} />;
}
