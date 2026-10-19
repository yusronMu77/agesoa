import type { Metadata } from "next";
import { ROUTES } from "@/configs/routes.config";
import { requireSession } from "@/features/auth/server/require-session";
import { isDnsResult } from "@/features/organizations/constants";
import { loadOrganization } from "@/features/organizations/server/load-organizations";
import { OrganizationDetailView, OrganizationUnavailableView } from "@/features/organizations/views/organization-detail.view";
import { type PageProps, routeParam, stringParam } from "@/lib/page-props";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Organization" };

export default async function OrganizationPage({ params, searchParams }: PageProps<{ organizationId: string }>) {
  const id = await routeParam(params, "organizationId");
  const token = await requireSession(ROUTES.organization(id));
  const data = await loadOrganization(token, id);
  if (!data.ok) return <OrganizationUnavailableView error={data.error} />;
  const { check, staff } = await searchParams;
  return <OrganizationDetailView {...data} check={isDnsResult(check) ? check : undefined} staffDecided={stringParam(staff)} />;
}
