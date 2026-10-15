# ADR-0003: Firestore as read model only

- Status: accepted
- Date: 2026-10-13
- Issues: #15 (CP0 architecture)

## Context

AGESOA client applications (such as the Next.js web portal and Witness PWA/mobile app) require real-time, low-latency updates for audit cases, public decision logs, and status dashboards. Cloud Firestore provides real-time client subscriptions out of the box.

However, allowing frontend applications or client SDKs to write directly to Firestore introduces critical architectural risks:
1. **Bypassing domain validation and business rules:** Direct client writes bypass backend domain logic, validation checks, face blurring / media processing pipelines, and agent evaluations.
2. **Missing audit trails and event records:** Direct client writes skip the transactional outbox pattern, leaving no outbox entries or CloudEvents to notify other microservices or record entries in the tamper-evident decision log.
3. **Data integrity corruption:** Dispersed client-side mutations lead to inconsistent read models and fragmented system state.

## Decision

1. **Read model only.** Firestore is used strictly as a CQRS read-side view model for fast, real-time client queries and live UI subscriptions.
2. **No direct frontend writes.** Frontend applications must NEVER write or mutate documents in Firestore directly using client SDKs.
3. **API-driven writes.** All write operations (e.g., report submission, evidence uploads, institutional follow-ups) must be submitted through authenticated REST API endpoints exposed by backend domain services (`ingestion`, `case-audit`, `trust`, `delivery`, `transparency`).
4. **Backend sync.** Backend services handle incoming API writes, execute domain logic within database transactions, emit outbox events, and sync updated read models to Firestore.
5. **Firestore Security Rules enforcement.** Security rules on Firestore collections disallow all client write/create/update/delete operations while permitting authorized read queries.

## Consequences

- Business logic, validation rules, privacy protections (e.g., face blurring), and authorization checks are strictly centralized in backend services.
- Every state mutation triggers official CloudEvents via the transactional outbox, maintaining complete system transparency and hash-chained logging.
- Frontend clients enjoy responsive, real-time UI updates via Firestore live listeners without compromising system data integrity.
