# agesoa-prototype

AGESOA (Agentic Social Audit) — a social audit platform that explains *why* a public problem happens and why it keeps recurring, not just *what* happened.

**Status:** scaffold, no code yet. Folder layout below; each folder's README says what it will hold.

| Folder | Holds |
|---|---|
| `services/` | 5 domain services: `ingestion`, `case-audit`, `trust`, `delivery`, `transparency` |
| `libs/platform-py` | shared technical library (auth, db, outbox/inbox, tracing) |
| `apps/` | `witness` (PWA + Android) and `portal` (Next.js) |
| `packages/` | `contracts` (OpenAPI, event schemas) and `ui` |
| `domain-packs/` | domain packs, starting with `mbg` |
| `examples/` | example institution integration |
| `eval/` | agent eval sets |
| `infra/tofu` | OpenTofu IaC |
| `templates/service` | new-service template |
| `docs/adr` | architecture decision records |

Tests here are unit/rule tests per service (`services/*/tests`) and agent evals (`eval/`). Cross-service
regression, E2E UI tests and Postman collections live in a separate QA repository; UI designs and the
design tokens source live in a separate design repository (only the exported tokens land in `packages/ui`).

License: TBD.
