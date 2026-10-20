/** Organization admin calls to trust (P1b): register, list, DNS TXT check. The token comes from the session. */

import type { PortalConfig } from "./config";
import { type FetchResult, fetchJson } from "./http";

export interface Organization {
  organization_id: string;
  name: string;
  kind: "newsroom" | "agency";
  domain: string;
  region: { regency_code?: string | null; regency_name?: string } | null;
  status: "awaiting_dns" | "verified" | "rejected";
  txt_record: string;
  verified_at: string | null;
  synthetic: boolean;
  created_at: string;
}

export type DnsResult = "verified" | "already_verified" | "no_record" | "token_mismatch" | "dns_error";

export interface DnsCheck {
  result: DnsResult;
  detail: string;
  organization: Organization;
}

export interface OrganizationInput {
  name: string;
  kind: "newsroom" | "agency";
  domain: string;
  region: { regency_name: string };
}

const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });
const base = (config: PortalConfig) => `${config.serviceUrls.trust}/v1/organizations`;

export function listMyOrganizations(config: PortalConfig, token: string): Promise<FetchResult<Organization[]>> {
  return fetchJson(base(config), bearer(token));
}

export function getOrganization(config: PortalConfig, token: string, id: string): Promise<FetchResult<Organization>> {
  return fetchJson(`${base(config)}/${encodeURIComponent(id)}`, bearer(token));
}

export function registerOrganization(
  config: PortalConfig,
  token: string,
  body: OrganizationInput,
): Promise<FetchResult<Organization>> {
  return fetchJson(base(config), { ...bearer(token), method: "POST", body });
}

export function checkDns(config: PortalConfig, token: string, id: string): Promise<FetchResult<DnsCheck>> {
  return fetchJson(`${base(config)}/${encodeURIComponent(id)}/dns-check`, { ...bearer(token), method: "POST" });
}

export const STATUS_LABEL: Record<Organization["status"], string> = {
  awaiting_dns: "Awaiting DNS",
  verified: "Verified",
  rejected: "Rejected",
};

export const KIND_LABEL: Record<Organization["kind"], string> = { newsroom: "Newsroom", agency: "Government agency" };
