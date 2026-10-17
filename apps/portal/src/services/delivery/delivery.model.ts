/** Agency integration data of the delivery service (SCR-062): webhook subscription, API key, deliveries. */

export interface Subscription {
  id: string;
  webhook_url: string;
  region_code: string | null;
  category: string | null;
  active: boolean;
  created_at: string;
}

export interface Institution {
  organization_id: string;
  name: string;
  kind: "newsroom" | "agency";
  synthetic: boolean;
  subscription: Subscription | null;
  api_key: { prefix: string; created_at: string } | null;
}

export interface SubscriptionInput {
  webhook_url: string;
  region_code?: string | null;
  category?: string | null;
}

export interface SubscriptionCreated {
  subscription: Subscription;
  /** HMAC secret, returned only once. */
  secret: string;
}

export interface ApiKeyCreated {
  /** Returned only once; delivery keeps only its hash. */
  api_key: string;
  prefix: string;
  created_at: string;
}

export interface TestEventQueued {
  delivery_id: string;
  event_id: string;
}

export interface DeliveryAttempt {
  attempt: number;
  http_status: number | null;
  error: string | null;
  attempted_at: string;
}

export type DeliveryStatus = "pending" | "delivered" | "failed";

export interface Delivery {
  delivery_id: string;
  event_id: string;
  event: "audit_report.final" | "test_event";
  case_id: string;
  status: DeliveryStatus;
  internal_ticket: string | null;
  created_at: string;
  attempts: DeliveryAttempt[];
}
