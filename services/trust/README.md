# services/trust

Organizations, validators, staff confirmation, validation routing and quorum; agent Role.

Owns the Postgres database `trust`; no other service reads it. Generated from
`templates/service` (`.copier-answers.yml`).

| Path | Holds |
|---|---|
| `src/agesoa_trust/api.py` | public HTTP API (`/v1/...`) |
| `src/agesoa_trust/events.py` | handlers for the events routed here by `packages/contracts/events/catalog.json` |
| `src/agesoa_trust/tables.py`, `alembic/` | owned tables + migrations (`0001` = outbox/inbox) |
| `openapi.json` | published API contract, exported from code |

Platform endpoints (from `libs/platform-py`): `GET /healthz`, `GET /readyz` (own database reachable),
`POST /events/{type}` (Pub/Sub push, OIDC), `POST /internal/outbox/sweep`, `POST /internal/probe`.

## Run locally

```powershell
# from the repo root, devenv up + route active (agesoa-devenv)
Copy-Item services/trust/.env.example services/trust/.env   # then fill DATABASE_URL
cd services/trust
uv run alembic upgrade head
uv run uvicorn agesoa_trust.main:app --port 8003 --reload
```

## Contract

```powershell
uv run python -m agesoa_trust.export_openapi   # after any API change; a test fails while it is stale
uv run pytest services/trust
```
