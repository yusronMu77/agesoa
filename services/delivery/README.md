# services/delivery

Audit reports, institution subscriptions with signed webhooks, status and right-of-reply API; agent Report.

Owns the Postgres database `delivery`; no other service reads it. Generated from
`templates/service` (`.copier-answers.yml`).

| Path | Holds |
|---|---|
| `src/agesoa_delivery/api.py` | public HTTP API (`/v1/...`) |
| `src/agesoa_delivery/events.py` | handlers for the events routed here by `packages/contracts/events/catalog.json` |
| `src/agesoa_delivery/tables.py`, `alembic/` | owned tables + migrations (`0001` = outbox/inbox) |
| `openapi.json` | published API contract, exported from code |

Platform endpoints (from `libs/platform-py`): `GET /healthz`, `GET /readyz` (own database reachable),
`POST /events/{type}` (Pub/Sub push, OIDC), `POST /internal/outbox/sweep`, `POST /internal/probe`.

## Run locally

```powershell
# from the repo root, devenv up + route active (agesoa-devenv)
Copy-Item services/delivery/.env.example services/delivery/.env   # then fill DATABASE_URL
cd services/delivery
uv run alembic upgrade head
uv run uvicorn agesoa_delivery.main:app --port 8004 --reload
```

## Contract

```powershell
uv run python -m agesoa_delivery.export_openapi   # after any API change; a test fails while it is stale
uv run pytest services/delivery
```
