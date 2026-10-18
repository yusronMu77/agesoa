# AGESOA

**Agentic Social Audit**: a social audit platform that explains *why* a public problem happens and why it keeps
recurring, not just *what* happened.

> LAPOR! tells you what happened. AGESOA tells you why it keeps happening.

- **Live prototype** (demo mode, fictional data): https://agesoa-team.cloud.run
- **Demo video** (3 min): https://youtu.be/6NcSvIsFF0E
- Built for the **AI Builder Cup 2026** (Google Cloud × Hack2skill), theme Sustainability & Social Impact.

## How it works

1. **Witness**: a citizen reports with a photo and a voice note, anonymously. The Intake agent drafts the
   report; a privacy guard strips photo metadata and hashes the media.
2. **Rules as code**: business rules (time limits, evidence deadlines, quorum, HMAC, the hash chain) are code
   with tests, not prompts.
3. **Audit**: the Audit agent merges reports into one case, asks witnesses follow-up questions, tests patterns
   over past incidents, and traces symptom → direct cause → systemic cause. Every step carries an evidence
   status (Alleged, Supported, Proven).
4. **Validate**: human validators from different roles approve. **The AI never gives the verdict.**
5. **Publish**: the agency answers in public, and every decision is written to a hash-chained log that anyone
   can verify.

Agents are built with the Agent Development Kit (ADK) and Gemini on Vertex AI, and run inside five domain
services on Cloud Run (`asia-southeast2`) that talk through Pub/Sub events (transactional outbox, idempotent
inbox). Each service owns its Postgres database; Firestore holds read models only; BigQuery archives events
for pattern tests. Architecture decisions are in [`docs/adr`](docs/adr).

The core engine knows no domain. Subjects come as **domain packs**: school meals (`mbg`) is the first one.

**Data honesty:** the audit scenarios are synthetic and the organisations, validators and agencies in the demo
are fictional. Both are labelled in the product.

| Folder | Holds |
|---|---|
| `services/` | 5 domain services: `ingestion`, `case-audit`, `trust`, `delivery`, `transparency` |
| `libs/platform-py` | shared technical library (auth, db, outbox/inbox, tracing) |
| `apps/` | `witness` (PWA + Android) and `portal` (Next.js) |
| `packages/` | `contracts` (OpenAPI, event schemas) and `ui` |
| `domain-packs/` | domain packs: `general` (default) and `mbg` (school meals) |
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

## License

[Apache License 2.0](LICENSE). Security reports: see [SECURITY.md](SECURITY.md).
