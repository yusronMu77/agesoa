import { notFound } from "next/navigation";
import { loadConfig } from "@/configs/env.config";
import { ROUTES } from "@/configs/routes.config";
import { redirectWhenSignedOut } from "@/features/auth/server/require-session";
import { createBackend } from "@/services/backend";

/** SCR-060: the organizations this account administers. */
export async function loadMyOrganizations(token: string) {
  const mine = await createBackend(loadConfig(), { token }).trust.listMyOrganizations();
  redirectWhenSignedOut(mine, ROUTES.organizations);
  return { mine };
}

export type MyOrganizationsData = Awaited<ReturnType<typeof loadMyOrganizations>>;

/**
 * SCR-061/062/064/065: one organization. A verified newsroom gets its staff queue; only the admin of a verified
 * agency gets the integration dashboard (delivery answers 404 otherwise).
 */
export async function loadOrganization(token: string, id: string) {
  const { trust, delivery } = createBackend(loadConfig(), { token });
  const org = await trust.getOrganization(id);
  if (!org.ok && org.status === 404) notFound();
  if (!org.ok) return { ok: false as const, error: org.error };

  const o = org.data;
  const verified = o.status === "verified";
  const staff = verified && o.kind === "newsroom" ? await trust.listStaff(o.organization_id) : null;
  const [institution, deliveries] =
    verified && o.kind === "agency"
      ? await Promise.all([delivery.getInstitution(o.organization_id), delivery.listDeliveries(o.organization_id)])
      : [null, null];
  return { ok: true as const, organization: o, staff, institution, deliveries };
}

export type OrganizationData = Extract<Awaited<ReturnType<typeof loadOrganization>>, { ok: true }>;
