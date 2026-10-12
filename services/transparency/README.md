# services/transparency

Hash-chained public decision log (its only writer) and the public read models.

Owns the Postgres database `transparency`; no other service reads it. Generated from
`templates/service` (`.copier-answers.yml`).

| Path | Holds |
|---|---|
| `src/agesoa_transparency/api.py` | public HTTP API (`/v1/...`) |
| `src/agesoa_transparency/events.py` | handlers for the events routed here by `packages/contracts/events/catalog.json` |
| `src/agesoa_transparency/tables.py`, `alembic/` | owned tables + migrations (`0001` = outbox/inbox) |
| `openapi.json` | published API contract, exported from code |

Platform endpoints (from `libs/platform-py`): `GET /healthz`, `GET /readyz` (own database reachable),
`POST /events/{type}` (Pub/Sub push, OIDC), `POST /internal/outbox/sweep`, `POST /internal/probe`.

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
```
