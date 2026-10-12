# agesoa-prototype

AGESOA (Agentic Social Audit) — a social audit platform that explains *why* a public problem happens and why it keeps recurring, not just *what* happened.

**Status:** foundation (checkpoint CP0): contracts, platform library, domain pack format + MBG pack with
synthetic scenarios, five services with their own databases and the event path (outbox, Pub/Sub, inbox,
hash-chained decision log), the portal skeleton, OpenTofu for the `demo` environment, CI and deploy
workflows. Agents and product features arrive from CP1. Each folder's README says what it holds.

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

## Quick start (local)

```sh
uv sync --all-packages          # Python workspace (services, libs, contracts)
bun install                     # JS workspaces (portal, ui)
uv run pytest                   # unit + rule tests (DB tests need TEST_DATABASE_URL)
bun run portal:test
```

Running the services needs Postgres and the Pub/Sub emulator (see `services/<svc>/README.md`); deploying needs
`infra/tofu` (see its README).

Tests here are unit/rule tests per service (`services/*/tests`) and agent evals (`eval/`). Cross-service
regression, E2E UI tests and Postman collections live in a separate QA repository; UI designs and the
design tokens source live in a separate design repository (only the exported tokens land in `packages/ui`).

License: TBD.
