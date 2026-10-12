# services/ingestion

Citizen reports (drafts, corrections, media, privacy guard) and public signals; agents Intake and Signal.

Owns the Postgres database `ingestion`; no other service reads it. Generated from
`templates/service` (`.copier-answers.yml`).

| Path | Holds |
|---|---|
| `src/agesoa_ingestion/api.py` | public HTTP API (`/v1/...`) |
| `src/agesoa_ingestion/events.py` | handlers for the events routed here by `packages/contracts/events/catalog.json` |
| `src/agesoa_ingestion/tables.py`, `alembic/` | owned tables + migrations (`0001` = outbox/inbox) |
| `openapi.json` | published API contract, exported from code |

Platform endpoints (from `libs/platform-py`): `GET /healthz`, `GET /readyz` (own database reachable),
`POST /events/{type}` (Pub/Sub push, OIDC), `POST /internal/outbox/sweep`, `POST /internal/probe`.

## Run locally

```powershell
# from the repo root, devenv up + route active (agesoa-devenv)
Copy-Item services/ingestion/.env.example services/ingestion/.env   # then fill DATABASE_URL
cd services/ingestion
uv run alembic upgrade head
uv run uvicorn agesoa_ingestion.main:app --port 8001 --reload
```

## Contract

```powershell
uv run python -m agesoa_ingestion.export_openapi   # after any API change; a test fails while it is stale
uv run pytest services/ingestion
```
