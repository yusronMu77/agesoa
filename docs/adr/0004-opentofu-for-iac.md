# ADR-0004: OpenTofu for infrastructure as code

- Status: accepted
- Date: 2026-10-13
- Issues: #15 (CP0 architecture)

## Context

AGESOA requires automated, predictable, and reproducible infrastructure provisioning across development, staging, and production environments (e.g., GCP Cloud Run services, Cloud SQL PostgreSQL databases, Cloud Storage buckets, Identity Platform, Pub/Sub topics/subscriptions, IAM roles, and Firestore databases).

To ensure long-term sustainability, open-source compliance, and community governance post-competition, AGESOA requires a fully open-source, declarative Infrastructure as Code (IaC) tool compatible with the standard Terraform provider ecosystem.

## Decision

1. **OpenTofu standard.** OpenTofu is adopted as the sole Infrastructure as Code (IaC) tool for provisioning and managing all AGESOA cloud infrastructure.
2. **Repository location.** All infrastructure definitions, environment configurations (`demo`, `prod`), and reusable modules are maintained in `infra/tofu/`.
3. **Declarative state management.** Infrastructure state is stored securely in versioned remote backends (GCS buckets with state locking).
4. **CI/CD integration.** Infrastructure changes are validated and applied automatically via OpenTofu workflows (`tofu fmt`, `tofu validate`, `tofu plan`, `tofu apply`) integrated into CI/CD pipelines.

## Consequences

- Infrastructure definitions are fully open-source (MPL 2.0 license), community-driven, and free from restrictive commercial licensing.
- Complete parity and compatibility with HashiCorp Configuration Language (HCL) syntax and the Google Cloud Provider (`hashicorp/google`).
- All cloud resources across all environments are transparently defined, audited, and version-controlled alongside application source code.
