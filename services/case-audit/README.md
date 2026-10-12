# services/case-audit

Cases, evidence deadlines, witness interviews, audit trail and findings; agent Audit.

Owns the Postgres database `case_audit`; no other service reads it. Generated from
`templates/service` (`.copier-answers.yml`).

| Path | Holds |
|---|---|
| `src/agesoa_case_audit/api.py` | public HTTP API (`/v1/...`) |
| `src/agesoa_case_audit/events.py` | handlers for the events routed here by `packages/contracts/events/catalog.json` |
| `src/agesoa_case_audit/tables.py`, `alembic/` | owned tables + migrations (`0001` = outbox/inbox) |
| `openapi.json` | published API contract, exported from code |

Platform endpoints (from `libs/platform-py`): `GET /healthz`, `GET /readyz` (own database reachable),
`POST /events/{type}` (Pub/Sub push, OIDC), `POST /internal/outbox/sweep`, `POST /internal/probe`.

## Run locally

```powershell
# from the repo root, devenv up + route active (agesoa-devenv)
Copy-Item services/case-audit/.env.example services/case-audit/.env   # then fill DATABASE_URL
cd services/case-audit
uv run alembic upgrade head
uv run uvicorn agesoa_case_audit.main:app --port 8002 --reload
```

## Contract

```powershell
uv run python -m agesoa_case_audit.export_openapi   # after any API change; a test fails while it is stale
uv run pytest services/case-audit
```
