# ADR-0002: Database per service and transactional outbox pattern

- Status: accepted
- Date: 2026-10-13
- Issues: #15 (CP0 architecture)

## Context

In a microservices architecture, sharing a single centralized database across services creates tight coupling, database migration conflicts, and dangerous cross-domain queries or locks. Conversely, when microservices manage independent databases and need to communicate state changes to other services, updating the database and publishing a message/event over a message broker (the dual-write problem) can lead to data inconsistency if one operation succeeds while the other fails.

AGESOA requires strict data isolation between service bounded contexts (`ingestion`, `case-audit`, `trust`, `delivery`, `transparency`) while guaranteeing reliable, event-driven communication without relying on distributed two-phase commit (2PC) transactions.

## Decision

1. **Database per service.** Each microservice owns its dedicated PostgreSQL database schema and connection pool. No service may directly access or query another service's database.
2. **Transactional Outbox and Inbox pattern.**
   - Every service that publishes domain events records those events in an `outbox` table within the same database transaction as the business entity changes.
   - Background outbox publisher processes poll or stream from the `outbox` table and dispatch CloudEvents to GCP Pub/Sub (or local Pub/Sub emulator).
   - Receiving services write incoming CloudEvents to an `inbox` table within an atomic transaction to ensure idempotent processing and prevent duplicate event execution.
3. **Shared platform messaging library.** Microservices utilize the shared `agesoa_platform` library (`libs/platform-py`) for standard outbox writing, inbox deduplication, and CloudEvent formatting.

## Consequences

- Direct data dependencies between services are prevented; schema migrations for one service do not break or lock other services.
- Event publishing is atomic with business database transactions, completely eliminating dual-write inconsistencies.
- Event delivery is at-least-once, with inbox deduplication guaranteeing exactly-once processing semantics at the receiver level.
- Cross-service data consistency is eventually consistent via domain events.
