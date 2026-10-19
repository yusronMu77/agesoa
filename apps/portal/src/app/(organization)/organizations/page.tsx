import type { Metadata } from "next";
import { ROUTES } from "@/configs/routes.config";
import { requireSession } from "@/features/auth/server/require-session";
import { loadMyOrganizations } from "@/features/organizations/server/load-organizations";
import { OrganizationsView } from "@/features/organizations/views/organizations.view";
import { type PageProps, stringParam } from "@/lib/page-props";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Organizations" };

export default async function OrganizationsPage({ searchParams }: PageProps) {
  const token = await requireSession(ROUTES.organizations);
  const data = await loadMyOrganizations(token);
  return <OrganizationsView {...data} error={stringParam((await searchParams).error)} />;
}
