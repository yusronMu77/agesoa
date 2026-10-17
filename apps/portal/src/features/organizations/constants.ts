import type { BadgeTone } from "@/components/ui/badge";
import type { Delivery, DeliveryStatus } from "@/services/delivery/delivery.model";
import type { DnsResult, OrganizationKind, OrganizationStatus } from "@/services/trust/trust.model";

export const STATUS_LABEL: Record<OrganizationStatus, string> = {
  awaiting_dns: "Awaiting DNS",
  verified: "Verified",
  rejected: "Rejected",
};

export const statusTone = (status: OrganizationStatus): BadgeTone => (status === "verified" ? "ok" : "warn");

export const KIND_LABEL: Record<OrganizationKind, string> = { newsroom: "Newsroom", agency: "Government agency" };

/** SCR-065: result of a DNS check. A missing record keeps the organization waiting; it is not a rejection. */
export const DNS_RESULT_TEXT: Record<DnsResult, string> = {
  verified: "Verified: the TXT record was found on your domain.",
  already_verified: "This domain is already verified.",
  no_record: "No AGESOA TXT record found yet. DNS changes can take a few minutes; try again.",
  token_mismatch: "A TXT record agesoa-verify=… exists but the token is different. Copy the value below exactly.",
  dns_error: "The DNS lookup failed. Try again in a moment.",
};

/** A DNS result from the URL; own keys only, so `?check=toString` is not a result. */
export const isDnsResult = (value: unknown): value is DnsResult => typeof value === "string" && Object.hasOwn(DNS_RESULT_TEXT, value);

export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  pending: "Pending",
  delivered: "Delivered",
  failed: "Failed",
};

export const DELIVERY_STATUS_TONE: Record<DeliveryStatus, BadgeTone> = { pending: "warn", delivered: "ok", failed: "error" };

export const DELIVERY_EVENT_LABEL: Record<Delivery["event"], string> = {
  "audit_report.final": "Final audit report",
  test_event: "Test event",
};
