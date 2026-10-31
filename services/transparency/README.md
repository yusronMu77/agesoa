# services/transparency

Hash-chained public decision log (its only writer), the public read models and public questions (Agen Report).

Owns the Postgres database `transparency`; no other service reads it. Generated from
`templates/service` (`.copier-answers.yml`).

| Path | Holds |
|---|---|
| `src/agesoa_transparency/api.py` | public HTTP API (`/v1/...`) |
| `src/agesoa_transparency/events.py` | handlers for the events routed here by `packages/contracts/events/catalog.json` |
| `src/agesoa_transparency/chain.py` | hash-chained decision log, format in [ADR-0005](../../docs/adr/0005-decision-log-hash-chain.md) |
| `src/agesoa_transparency/read_model.py` | Firestore public read model projected from consumed events |
| `src/agesoa_transparency/answers.py` | Agen Report: public questions answered from validated findings only |
| `src/agesoa_transparency/tables.py`, `alembic/` | owned tables + migrations (`0001` outbox/inbox, `0002` decision log, `0003` read model source) |
| `openapi.json` | published API contract, exported from code |

Platform endpoints (from `libs/platform-py`): `GET /healthz`, `GET /readyz` (own database reachable),
`POST /events/{type}` (Pub/Sub push, OIDC), `POST /internal/outbox/sweep`, `POST /internal/probe`.

## Public read model (Firestore)

Every consumed public event is stored in `read_model_events` inside the inbox transaction, then projected after
the commit: each affected document is rebuilt from all of its events, so projection is idempotent and
independent of delivery order. Only allow-listed fields are public (validators appear as tier + decision; report
contents and reporter references are never projected, only counted).

| Collection | From |
|---|---|
| `public_cases/{case_id}` | `case.updated`, `audit_report.created`, `follow_up.updated`, `right_of_reply.received` |
| `public_findings/{finding_id}` | `finding.ready_for_validation`, `validation.updated` (open progress: `validation_state` `awaiting_decisions` / `needs_evidence`, `validation_progress` with counts + `deadline_at`), `validation.completed` (`validation_state` = outcome) |
| `public_signals/{signal_id}` | `signal.received` |
| `public_log/{seq}` | `decision_log` |
| `public_stats/summary` | aggregates |

Clients may only read these collections (`infra/firestore/firestore.rules`). `POST /internal/read-model/sync`
(Cloud Scheduler, every 5 minutes) projects anything left pending; `POST /internal/read-model/rebuild` drops
the collections and projects again from Postgres. Locally set `FIRESTORE_EMULATOR_HOST` (refused outside
`local`/`test`); `READ_MODEL_ENABLED=false` turns the projection off.

## Public questions (Agen Report)

`POST /v1/questions` `{question (3–300 characters), lang: id | en}` answers a public question about the findings
(portal page `/ask`). The answer may only use findings whose validation completed `approved`, projected with the same
allow-list as the read model (`build_finding`, `build_case` over `read_model_events`), and comes with the findings it
used (`references`: statement, evidence status, region, approvals, case id). Retrieval is lexical (Indonesian and
English terms, affixes included); an ADK agent writes the answer, and code keeps a reference only when it is a
retrieved finding: an answer without one, a failing model or a timeout (20 s) gives the extractive answer instead
(`method` `extractive`). The question is data to the agent, never instructions, and is neither stored nor logged.

`ANSWER_MODEL` is a Gemini model id (Vertex AI) or `rules` (the extractive answer written as a model response),
accepted only locally or with `demo_mode`.

## Run locally

```powershell
# from the repo root, devenv up + route active (agesoa-devenv)
Copy-Item services/transparency/.env.example services/transparency/.env   # then fill DATABASE_URL
cd services/transparency
uv run alembic upgrade head
uv run uvicorn agesoa_transparency.main:app --port 8005 --reload
```

## Contract

```powershell
uv run python -m agesoa_transparency.export_openapi   # after any API change; a test fails while it is stale
uv run pytest services/transparency
# Firestore emulator tests: FIRESTORE_EMULATOR_HOST; rules tests: FIRESTORE_RULES_EMULATOR_HOST (emulator started with --rules)
```
