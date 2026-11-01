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

## Agen Intake model limits

Vertex AI sometimes holds a call for minutes, or answers 429, while the next call answers in a few seconds. So the
model is not given a short limit and then asked again from the start: a call that is only slow is never cut.
`POST /v1/reports/{id}/intake` asks the model once; while it has not answered, a second call starts in parallel after
`INTAKE_HEDGE_AFTER_SECONDS` (10) and a third after another 10, up to `INTAKE_MAX_CALLS` (3). The first answer wins and
the other calls are cancelled. A call that fails with 429/5xx is replaced after 1 s; any other failure is not repeated.
After `INTAKE_DEADLINE_SECONDS` (45) the endpoint answers 503 and the reporter fills the draft by hand. Keep the
deadline below the 60 s request limit of the Cloud Run service. A healthy call takes 2-6 s, so it never starts a second
one; at most three calls are in flight for one Intake, and only after 10 s without an answer.

## Contract

```powershell
uv run python -m agesoa_ingestion.export_openapi   # after any API change; a test fails while it is stale
uv run pytest services/ingestion
```
