# AGENTS.md

Instructions for coding agents (Jules, Codex, Claude Code, ...) working in this repository. Humans start
with [README.md](README.md); every folder has its own README.

AGESOA is a social audit platform: a domain-agnostic core plus **domain packs** (`domain-packs/mbg` is the
first). Five Python services (FastAPI + ADK) talk through events; two frontends (`apps/portal` Next.js,
`apps/witness` Vite PWA + Capacitor).

## Setup and checks

```sh
bash scripts/agent/setup.sh        # once per environment (Jules: Initial Setup script, then "Run and Snapshot")
bash scripts/agent/db.sh           # throwaway PostGIS for DB tests (same image as CI), idempotent
export TEST_DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/postgres
```

Before opening a PR, run what CI (`.github/workflows/ci.yml`) runs and report each result in the PR:

```sh
uv run ruff check .
uv run ruff format --check .
uv run pytest -q                                   # with TEST_DATABASE_URL set, or DB tests fail
# only when apps/portal or packages/ changed:
bun run --cwd apps/portal typecheck && bun run --cwd apps/portal test && bun run --cwd apps/portal build
# only when apps/witness or packages/ changed:
bun run --cwd apps/witness test && bun run --cwd apps/witness build
```

- Changed a service's HTTP API: `uv run python -m agesoa_<svc>.export_openapi` (a test fails while
  `services/<svc>/openapi.json` is stale). `<svc>` uses underscores (`agesoa_case_audit`).
- Changed a table: add a new Alembic migration in `services/<svc>/alembic/`; never edit an existing one.
- Tooling: **uv** for Python, **bun** for JS. Never npm, pip, yarn or pnpm (scripts, docs, lockfiles).
  Do not touch `uv.lock` / `bun.lock` unless the task changes a dependency.

## Architecture rules (a PR that breaks one is rejected)

1. **Five services by domain**: `ingestion`, `case-audit`, `trust`, `delivery`, `transparency`. Agents are
   capabilities inside a service, never a new service.
2. **Database per service**: a service never imports another service's package, tables, models or database
   URL. Cross-service data moves only through events or HTTP APIs.
3. **Events**: CloudEvents JSON. Each event type has a JSON Schema in `packages/contracts/events/`, an
   example in `events/examples/` and an entry in `events/catalog.json`, all changed in the same PR.
   Publish through the transactional outbox and consume through the idempotent inbox of `libs/platform-py`;
   never publish to Pub/Sub directly from a request handler.
4. **`transparency` is the only writer** of the hash-chained decision log; other services publish events.
5. **Firestore is a read model only**, written by services; frontends never write to any database.
6. **Domain logic lives only in `domain-packs/<pack>`**. Service code and `libs/` stay domain-agnostic: no
   MBG categories, rules or wording in them. `libs/platform-py` is technical only (db, auth, outbox/inbox,
   tracing).
7. **Business rules are code + tests** (4-hour rule, evidence deadline, quorum, HMAC signatures, hash
   chain), never only a prompt. Every rule change comes with tests for its boundaries.
8. **`demo_mode`**: fictional data, scripted interviews and seed validators exist only behind this flag;
   settings refuse it in `prod`.
9. **AI never gives a verdict**: findings carry an evidence status and become final only after human
   validation; personal names are never shown; demo data is synthetic and labelled as such.
10. No secrets in code, fixtures or logs; region `asia-southeast2`; test data is fictional.

## Out of scope unless the task says so explicitly

- `infra/tofu/`, `.github/workflows/deploy.yml`, anything that creates or changes cloud resources. Never
  run `tofu apply`, `gcloud` or a deploy.
- Calling Gemini or any real third-party API from tests: mock them in unit tests. Agent quality is measured
  in `eval/`, not in unit tests.
- `templates/service/template/` is a copier template; change it only for template tasks.
- E2E / cross-service regression tests: they live in a separate QA repository. Unit and rule tests stay in
  `services/<svc>/tests/`, `libs/*/tests/`, `packages/*/tests/`, `domain-packs/*/tests/`.
- UI layout and copy in `apps/`: implement only what the task specifies; do not invent screens or text.

## Git and pull requests

- English everywhere: code, comments, docs, commit messages, PR title and body (issues may be written in
  Indonesian; answer in English).
- Commit message: `{type}({yyyyMMddHHmm}): [{taskId}] {message}`, `type` in `feature`, `bugfix`,
  `refactor`, `docs`, `chore`, `ci`, `build`, `config`; `taskId` = the checkpoint of the issue milestone
  (`CP3 · ...` -> `CP3`). Example: `feature(202610141530): [CP3] case-audit: evidence deadline rule + tests`.
- No AI attribution lines (`Co-Authored-By` an AI, "Generated with ...") in commits or PR bodies.
- PR body starts with `Closes #<issue>` (the project board depends on it), then: what changed, the checks
  above with their results, and what could not be verified here (needs the local dev environment, real
  Gemini, or E2E).
- One issue per PR, smallest diff that solves it, no unrelated reformatting. Never push to `main`.
- A feature issue is Done only after maintainers attach E2E evidence from the QA repository. Do not claim
  an issue is complete beyond the checks you actually ran.
