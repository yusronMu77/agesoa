# ADR-0001: Service per domain architecture

- Status: accepted
- Date: 2026-10-13
- Issues: #15 (CP0 architecture)

## Context

AGESOA (Agentic Social Audit) utilizes AI agents to conduct automated social program audits, evaluate evidence, compute trust scores, and track follow-ups. A naive system design might assign a dedicated microservice process or deployment unit to each individual AI agent (e.g., separate services for intake agent, rule validator agent, case analysis agent, follow-up agent).

Assigning a separate service per AI agent creates several problems:
1. **Process explosion and operational overhead:** Managing dozens of agent microservices increases deployment complexity, resource consumption, and monitoring burden.
2. **Brittle coupling:** Agent-to-agent communication via direct RPC/HTTP leads to tight coupling and cascading runtime failures.
3. **Unclear domain boundaries:** Agents frequently collaborate on shared domain entities; separating them into distinct services fragments business domain boundaries.

## Decision

1. **Service per domain context.** Microservices are structured around core business bounded contexts (domains), not per individual AI agent. The initial microservices are:
   - `ingestion`: Ingests and processes incoming evidence, media, and reports (e.g., face blurring, OCR, content moderation).
   - `case-audit`: Manages social audit cases, orchestrates audit rules, and executes AI audit agents.
   - `trust`: Calculates citizen/institution trust metrics, reputation scores, and verification status.
   - `delivery`: Coordinates institution notifications, workflow follow-ups, and escalation tracking.
   - `transparency`: Manages the public decision log, hash chain verification, and public read models.
2. **Agents as internal domain workers/components.** AI agents exist as execution components, tasks, or workers contained within their respective domain services (e.g., audit agents run within or are orchestrated by `case-audit`).
3. **Domain packs for extensibility.** Domain-specific audit rules, prompt templates, and evaluation criteria are packaged into domain packs (`domain-packs/`), which are loaded into domain services without requiring new microservices.

## Consequences

- Clear domain boundaries adhering to Domain-Driven Design (DDD) principles.
- Scaling and deployment decisions are tied to business domain load rather than individual agent lifecycles.
- Adding or updating an AI agent or domain pack rule does not require provisioning or deploying a new microservice infrastructure unit.
- Inter-service communication uses asynchronous domain events (`outbox`/`inbox` pattern) or well-defined REST contracts (`packages/contracts/`).
