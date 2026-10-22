# AGESOA

**Agentic Social Audit**: a social audit platform that explains *why* a public problem happens and why it keeps
recurring, not just *what* happened.

> Complaint channels record what happened. AGESOA tells you why it keeps happening.

- **Live prototype** (demo mode, fictional data): https://agesoa-team.cloud.run
- **Demo video** (3 min): https://youtu.be/6NcSvIsFF0E
- Built for the **AI Builder Cup 2026** (Google Cloud × Hack2skill), theme Sustainability & Social Impact.

Forest fires return every few years and their haze crosses borders; school meals keep making children sick.
Reports get filed and tickets get closed, but nobody keeps an independent record of why it keeps happening.

**Live today** on Cloud Run: the public dashboard, the hash-chained decision log with chain verification, the
readiness of the five services, and validator and organization sign-in. Synthetic reports are merged into a case,
the Audit agent ranks the cause branches with Gemini and tests them against the BigQuery pattern archive, and one
finding has been approved by a quorum of two validators from different organizations. One step is still manual in
the demo: an operator turns the top-ranked hypotheses into the finding that goes to validators; drafting it
automatically is the next piece of work. The demo video walks through the full flow on the product's English UI
designs; the Witness app and the portal are built to match them screen by screen.

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

The core engine knows no domain. Subjects come as **domain packs**: school meals (`mbg`) is the first one;
forest-fire haze, health services and roads are next.

**Data honesty:** the audit scenarios are synthetic and the organizations, validators and agencies in the demo
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

## Demo account

One account opens every surface of the portal, so the whole flow can be tried without registering:

| | |
|---|---|
| Email | `demo@demo.agesoa.local` |
| Password | `AgesoaDemo-2026!` |
| Roles | validator (VAL-DEMO-4, journalist, Kabupaten Sukamaju), admin of the fictional agency *Dinas Contoh Sukamaju (fictional)*, operator |

Where to sign in (choose a role from the **Publik** chip in the public header):

| Surface | Sign in | What you can do |
|---|---|---|
| Validator | `/validator/masuk` | queue, decide (approve / reject / needs evidence), decision log |
| Organisation | `/instansi/masuk` | the fictional agency's dashboard: webhook, API key, deliveries |
| Operator | `/login?next=/ops` | service status, events, outbox, demo reset |

The account exists only where `demo_mode` is on (local devenv and the demo environment; `demo_mode` is refused in
prod) and is created by the trust service at start-up (`services/trust/demo/validators.json`). Everything it touches
is fictional and labelled SIMULASI. Its decisions are recorded in the public hash-chained log like any validator's,
and the operator role can reset the demo data. Witness needs no account (anonymous reporting).

## Frontend naming

Use English for frontend documentation, source paths, identifiers and canonical URL segments. The selected UI
language does not change URLs. Use **organization** for the shared workspace concept; newsrooms and government
agencies are organization types. Existing Indonesian URL segments are temporary compatibility routes and will
redirect permanently to their English replacements when the route migration lands. See the
[portal README](apps/portal/README.md#routes-and-naming) for the full route map.

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
