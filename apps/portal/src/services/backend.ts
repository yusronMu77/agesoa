/**
 * Composition root of the backend clients. A page or server action builds it once per request:
 *
 *   const { trust, caseAudit } = createBackend(loadConfig(), { token });
 *
 * Public backends (decision log, read model) never receive the session token.
 */

import type { PortalConfig } from "@/configs/env.config";
import { createCaseAuditService } from "./case-audit/case-audit.service";
import { createDeliveryService } from "./delivery/delivery.service";
import { createApiClient } from "./http/api-client";
import type { FetchLike } from "./http/fetch-json";
import { createReadModelService } from "./read-model/read-model.service";
import { createTransparencyService } from "./transparency/transparency.service";
import { createTrustService } from "./trust/trust.service";

export interface BackendOptions {
  /** Session token for the signed-in backends (trust, case-audit, delivery). */
  token?: string | null;
  fetchImpl?: FetchLike;
}

export function createBackend(config: PortalConfig, { token = null, fetchImpl }: BackendOptions = {}) {
  const signedIn = (baseUrl: string) => createApiClient({ baseUrl, token, fetchImpl });
  const anonymous = (baseUrl: string) => createApiClient({ baseUrl, fetchImpl });
  const urls = config.serviceUrls;

  return {
    transparency: createTransparencyService(anonymous(urls.transparency)),
    readModel: createReadModelService(anonymous(config.readModelUrl)),
    trust: createTrustService(signedIn(urls.trust)),
    caseAudit: createCaseAuditService(signedIn(urls["case-audit"])),
    delivery: createDeliveryService(signedIn(urls.delivery)),
  };
}

export type Backend = ReturnType<typeof createBackend>;
