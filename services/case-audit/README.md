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

## Hypotheses

Whenever a source joins a case, `audit.py` ranks the domain pack's `cause_framework` branches against the case's
reports and signals (`agesoa_packs.rank_branches`, deterministic: same evidence, same order) and replaces the
case's `hypothesis` rows in `audit_trail` (top 3: rank, score, supporting and against sources, violated rules).

- Each row carries an evidence status and evidence references (`report:<id>`, `signal:<id>`, stored evidence ids,
  `rule:<id>`). The status follows the kind of evidence, never the words of a report: symptoms alone are
  `alleged`; a stored photo/voice note, a news signal or a second source reaches `supported`; `proven` needs a lab
  result, which no source kind carries yet. It is always capped by the case's maximum finding status.
- Each ranking adds one `audit.hypotheses_ranked` entry to the decision log (rule `hypothesis_ranking`).
- This is the lexical fallback, not an understanding of the case: on the six synthetic scenarios it puts the planted
  cause in the top 3 for 3 of 6 (`uv run eval`). The model-written hypotheses (Gemini via ADK) have to beat it.
- A hypothesis is not a finding: findings and `temuan.siap_validasi` come with the validation flow (#45).

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
