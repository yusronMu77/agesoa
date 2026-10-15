# services/case-audit

Cases, evidence deadlines, witness interviews, audit trail and findings; agent Audit.

Owns the Postgres database `case_audit`; no other service reads it. Generated from
`templates/service` (`.copier-answers.yml`).

| Path | Holds |
|---|---|
| `src/agesoa_case_audit/api.py` | public HTTP API (`/v1/...`) |
| `src/agesoa_case_audit/cases.py` | case rules as code: grouping, evidence deadline, status cap (pure functions) |
| `src/agesoa_case_audit/events.py` | handlers for the events routed here by `packages/contracts/events/catalog.json` |
| `src/agesoa_case_audit/tables.py`, `alembic/` | owned tables + migrations (`0001` = outbox/inbox) |
| `openapi.json` | published API contract, exported from code |

Platform endpoints (from `libs/platform-py`): `GET /healthz`, `GET /readyz` (own database reachable),
`POST /events/{type}` (Pub/Sub push, OIDC), `POST /internal/outbox/sweep`, `POST /internal/probe`.

## Cases and the evidence deadline

`laporan.diterima` and `sinyal.diterima` are grouped into cases by `cases.py` (not by a prompt):

- A source joins an open case when domain, category and regency (code, else normalised name) agree and the
  incidents are at most 7 days apart. An unknown regency never matches; no match opens a new case.
- The incident time comes from the domain pack's evidence-deadline anchor field, else its fallback field at
  00:00 WIB; a signal uses its incident day at 00:00 WIB. The deadline is that time + the pack's hours.
- The earliest deadline in a case governs. Within it evidence is `available` and findings may reach `proven`;
  after it evidence is `likely_lost` and findings are capped at the pack's `after_deadline_max_status`.
  No known deadline: `unknown`, no cap. The status is evaluated at the event time.
- Every change emits `kasus.diperbarui` and decision-log entries (`case.opened` / `case.source_added`,
  `case.deadline_set`) through the outbox; the log shows the rule name, never a person.

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
