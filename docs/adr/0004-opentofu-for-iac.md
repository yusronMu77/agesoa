# ADR-0004: OpenTofu for infrastructure as code

- Status: accepted
- Date: 2026-10-13
- Issues: #15 (CP0 architecture)

## Context

AGESOA requires automated, predictable, and reproducible infrastructure provisioning across environments (e.g., GCP Cloud Run services, Cloud SQL PostgreSQL databases, Cloud Storage buckets, Identity Platform, Pub/Sub topics/subscriptions, IAM roles, and Firestore databases).

To ensure long-term sustainability, open-source compliance, and community governance post-competition, AGESOA requires a fully open-source, declarative Infrastructure as Code (IaC) tool compatible with the standard Terraform provider ecosystem.

## Decision

1. **OpenTofu standard.** OpenTofu is adopted as the sole Infrastructure as Code (IaC) tool for provisioning and managing all AGESOA cloud infrastructure.
2. **Repository location.** All infrastructure definitions, environment configurations (`bootstrap` for the state bucket, `envs/demo`, more environments later) and reusable modules are maintained in `infra/tofu/`.
3. **Declarative state management.** Infrastructure state is stored securely in versioned remote backends (GCS buckets with state locking).
4. **Reviewed, manual apply.** `tofu plan` is read before every `tofu apply`, and `apply` is run by an operator, not by CI. The deploy workflow (`.github/workflows/deploy.yml`) only ships service images and reads the variables from `tofu output github_variables`. No cloud resource is created by hand in the console.

## Alternatives considered

- **Terraform**: same HCL and providers, but not open source (BUSL). Rejected for the open-source requirement.
- **Console or `gcloud` scripts**: not repeatable and not reviewable.

## Consequences

- Infrastructure definitions are fully open-source (MPL 2.0 license), community-driven, and free from restrictive commercial licensing.
- Complete parity and compatibility with HashiCorp Configuration Language (HCL) syntax and the Google Cloud Provider (`hashicorp/google`).
- All cloud resources across all environments are transparently defined, audited, and version-controlled alongside application source code.
