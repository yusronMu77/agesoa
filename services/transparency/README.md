# services/transparency

Hash-chained public decision log (its only writer) and the public read models.

Owns the Postgres database `transparency`; no other service reads it. Generated from
`templates/service` (`.copier-answers.yml`).

| Path | Holds |
|---|---|
| `src/agesoa_transparency/api.py` | public HTTP API (`/v1/...`) |
| `src/agesoa_transparency/events.py` | handlers for the events routed here by `packages/contracts/events/catalog.json` |
| `src/agesoa_transparency/chain.py` | hash-chained decision log, format in [ADR-0005](../../docs/adr/0005-decision-log-hash-chain.md) |
| `src/agesoa_transparency/read_model.py` | Firestore public read model projected from consumed events |
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
| `public_cases/{case_id}` | `kasus.diperbarui`, `laporan_audit.dibuat`, `tindak_lanjut.diperbarui`, `hak_jawab.diterima` |
| `public_findings/{finding_id}` | `temuan.siap_validasi`, `validasi.selesai` |
| `public_signals/{signal_id}` | `sinyal.diterima` |
| `public_log/{seq}` | `decision_log` |
| `public_stats/summary` | aggregates |

Clients may only read these collections (`infra/firestore/firestore.rules`). `POST /internal/read-model/sync`
(Cloud Scheduler, every 5 minutes) projects anything left pending; `POST /internal/read-model/rebuild` drops
the collections and projects again from Postgres. Locally set `FIRESTORE_EMULATOR_HOST` (refused outside
`local`/`test`); `READ_MODEL_ENABLED=false` turns the projection off.

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
