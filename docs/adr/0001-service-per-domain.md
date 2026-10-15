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
   - `ingestion`: citizen reports (drafts, corrections, media), the privacy guard (metadata removal, face blur, evidence hash) and public signals; agents Intake and Signal.
   - `case-audit`: cases, evidence deadlines, witness interviews, the audit trail and findings; agent Audit.
   - `trust`: organizations, validators, staff confirmation, validation routing and quorum; agent Role. AI never gives a verdict: a finding becomes final only after human validation here.
   - `delivery`: audit reports, institution subscriptions with signed webhooks, status updates and the right of reply; agent Report.
   - `transparency`: the hash-chained public decision log (its only writer) and the public read models.
2. **Agents as internal domain workers/components.** AI agents exist as execution components, tasks, or workers contained within their respective domain services (e.g., audit agents run within or are orchestrated by `case-audit`).
3. **Domain packs for extensibility.** Domain-specific audit rules, prompt templates, and evaluation criteria are packaged into domain packs (`domain-packs/`), which are loaded into domain services without requiring new microservices.

## Alternatives considered

- **One service per agent** (rejected, see Context): five agents would become five deployables that share cases and evidence.
- **One monolith**: simplest to run, but it gives up independent scaling and the rule that only `transparency` writes the decision log.

## Consequences

- Clear domain boundaries adhering to Domain-Driven Design (DDD) principles.
- Scaling and deployment decisions are tied to business domain load rather than individual agent lifecycles.
- Adding or updating an AI agent or domain pack rule does not require provisioning or deploying a new microservice infrastructure unit.
- Inter-service communication uses asynchronous domain events (`outbox`/`inbox` pattern) or well-defined REST contracts (`packages/contracts/`).
