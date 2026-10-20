# services/delivery

Audit reports, institution subscriptions with signed webhooks, status and right-of-reply API; agent Report.

Owns the Postgres database `delivery`; no other service reads it. Generated from
`templates/service` (`.copier-answers.yml`).

| Path | Holds |
|---|---|
| `src/agesoa_delivery/api.py` | public HTTP API (`/v1/...`) |
| `src/agesoa_delivery/institutions.py` | agency dashboard API (webhook subscription, pause/resume, API key, test event, delivery history; organization admin), institution API (`/api/v1/cases/{id}/status|reply`, API key), internal webhook attempts + demo audit reports |
| `src/agesoa_delivery/webhooks.py` | webhook bodies, signing (HMAC-SHA256), attempts and retries (Cloud Tasks outside local, in-process scheduler in the devenv) |
| `src/agesoa_delivery/secrets_store.py` | webhook secrets: Secret Manager outside local, a table locally |
| `src/agesoa_delivery/events.py` | handlers for the events routed here by `packages/contracts/events/catalog.json` |
| `src/agesoa_delivery/tables.py`, `alembic/` | owned tables + migrations (`0001` = outbox/inbox, `0003` = institution webhooks, `0004` = webhook pause, `0005` = follow-up detail) |
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

## Institution webhooks

Contract: `packages/contracts/webhook/README.md`; reference receiver: `examples/sim-institution`.

1. trust announces verified organizations (`organization.verified`, with `admin_ref`); delivery keeps them in
   `institutions`. Only the admin of a verified **agency** manages its webhook and API key.
2. An audit report (until the Report agent exists: `POST /internal/demo/audit-reports`, demo_mode only) becomes one
   `webhook_jobs` row per matching subscription (region + category, null = all), with the validation labels of the case
   (from `validation.completed`: role + regency, never names).
3. Each attempt signs the stored body and records a `deliveries` row; failures are retried after
   `WEBHOOK_RETRY_DELAYS` (default `30,120,600` s), then marked failed. A delivered report publishes
   `audit_report.sent` and logs `audit_report.delivered`.
4. The agency admin can pause delivery (`POST /v1/institutions/{id}/subscription/pause`, SCR-062 "Jeda webhook").
   While paused, audit reports become `held` jobs: not sent, not dropped, no attempt counted; a retry that comes due
   is held too, keeping its attempt count. `.../subscription/resume` releases them oldest first, spaced
   `WEBHOOK_RESUME_SPACING` (default 1 s) apart, through the normal attempt path (HMAC at send time, same event id,
   same retries). Both are idempotent. Test events are never held. Replacing the subscription keeps the pause and
   moves the held jobs to the new one. The history keeps `held_at` on every delivery that was held.
5. The institution API only accepts cases delivered to that institution (404 otherwise) and never changes a finding.
   A status update may carry `detail` (optional, one line, max 160 characters, e.g. "Pemeriksaan ulang
   dijadwalkan"): it travels in `follow_up.updated` and is shown publicly as the institution's own statement, unedited.

Settings: `WEBHOOK_QUEUE`, `SELF_URL`, `TASKS_INVOKER_EMAIL` (Cloud Tasks; unset = in-process), `PORTAL_URL` (case
links), `WEBHOOK_TIMEOUT`, `WEBHOOK_RESUME_SPACING`, `REGION`.
