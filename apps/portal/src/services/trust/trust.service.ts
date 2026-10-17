/**
 * Calls to the trust service: validator profile and registration, validation requests and decisions,
 * organization registration with DNS verification, and staff confirmation. trust verifies the Bearer token
 * (signature, audience, role claim); the portal never trusts the claims itself.
 */

import { type ApiClient, segment } from "@/services/http/api-client";
import type {
  DecisionInput,
  DecisionResult,
  DnsCheck,
  NewsroomOption,
  Organization,
  OrganizationInput,
  Registration,
  RoleOption,
  StaffCandidate,
  StaffDecision,
  StaffDecisionResult,
  ValidationDetail,
  ValidationRequest,
  ValidatorProfile,
} from "./trust.model";

/** Agen Peran reads the document with Gemini: allow it time (retries + fallback model). */
const REGISTRATION_TIMEOUT_MS = 90_000;

export function createTrustService(client: ApiClient) {
  const request = (findingId: string) => `/v1/validation-requests/${segment(findingId)}`;
  const organization = (id: string) => `/v1/organizations/${segment(id)}`;

  return {
    // Validators and validation
    getMyProfile: () => client.get<ValidatorProfile>("/v1/validators/me"),
    listValidationRequests: () => client.get<ValidationRequest[]>("/v1/validation-requests"),
    getValidationRequest: (findingId: string) => client.get<ValidationDetail>(request(findingId)),
    decide: (findingId: string, body: DecisionInput) => client.post<DecisionResult>(`${request(findingId)}/decisions`, body),

    // Validator registration; the role and newsroom lists are public
    listRoles: () => client.get<RoleOption[]>("/v1/validators/roles", { anonymous: true }),
    listNewsrooms: () => client.get<NewsroomOption[]>("/v1/organizations/newsrooms", { anonymous: true }),
    registerValidator: (form: FormData) =>
      client.postForm<Registration>("/v1/validators/registrations", form, { timeoutMs: REGISTRATION_TIMEOUT_MS }),

    // Organizations
    listMyOrganizations: () => client.get<Organization[]>("/v1/organizations"),
    getOrganization: (id: string) => client.get<Organization>(organization(id)),
    registerOrganization: (body: OrganizationInput) => client.post<Organization>("/v1/organizations", body),
    checkDns: (id: string) => client.post<DnsCheck>(`${organization(id)}/dns-check`),

    // Staff confirmation by a verified newsroom
    listStaff: (organizationId: string) => client.get<StaffCandidate[]>(`${organization(organizationId)}/staff`),
    decideStaff: (organizationId: string, validatorId: string, decision: StaffDecision) =>
      client.post<StaffDecisionResult>(`${organization(organizationId)}/staff/${segment(validatorId)}`, { decision }),
  };
}

export type TrustService = ReturnType<typeof createTrustService>;
