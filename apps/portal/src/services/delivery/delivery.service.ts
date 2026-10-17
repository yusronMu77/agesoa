/** Agency admin calls to delivery (SCR-062): webhook subscription, API key, test event, delivery history. */

import { type ApiClient, segment } from "@/services/http/api-client";
import type {
  ApiKeyCreated,
  Delivery,
  Institution,
  SubscriptionCreated,
  SubscriptionInput,
  TestEventQueued,
} from "./delivery.model";

export function createDeliveryService(client: ApiClient) {
  const institution = (id: string) => `/v1/institutions/${segment(id)}`;

  return {
    /** The agency dashboard; 404 when the caller is not the admin of this verified agency. */
    getInstitution: (id: string) => client.get<Institution>(institution(id)),
    saveSubscription: (id: string, body: SubscriptionInput) => client.put<SubscriptionCreated>(`${institution(id)}/subscription`, body),
    createApiKey: (id: string) => client.post<ApiKeyCreated>(`${institution(id)}/api-key`),
    sendTestEvent: (id: string) => client.post<TestEventQueued>(`${institution(id)}/test-event`),
    listDeliveries: (id: string) => client.get<Delivery[]>(`${institution(id)}/deliveries`),
  };
}

export type DeliveryService = ReturnType<typeof createDeliveryService>;
