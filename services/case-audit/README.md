# services/case-audit

Cases, evidence deadlines, witness interviews, audit trail and findings; agent Audit.

Owns the Postgres database `case_audit`; no other service reads it. Generated from
`templates/service` (`.copier-answers.yml`).

| Path | Holds |
|---|---|
| `src/agesoa_case_audit/api.py` | public HTTP API (`/v1/...`) |
| `src/agesoa_case_audit/cases.py` | case rules as code: grouping, evidence deadline, status cap (pure functions) |
| `src/agesoa_case_audit/audit.py` | one audit round: hypotheses, witness questions, pattern tests |
| `src/agesoa_case_audit/interview.py` | witness questions (which next, who may answer) and answers |
| `src/agesoa_case_audit/patterns.py` | pattern tests: fixed metric queries per cause branch, incident stores |
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
- The lexical ranking is the fallback and the baseline, not an understanding of the case: on the six synthetic
  scenarios it puts the planted cause in the top 3 for 3 of 6 (`uv run eval`). The model-written hypotheses have to
  beat it (TC-017, `uv run eval --model <gemini model id>`).
- **Agen Audit** (`agent.py`) is that model: an ADK `LlmAgent` with an output schema built from the pack. It ranks
  the pack's branches and cites the sources behind each; code keeps only branches of the pack, only sources that
  exist, at most 3, and computes the evidence status itself from the cited sources, so a model can neither invent
  evidence nor raise a status. If the model fails, times out (45 s) or returns nothing usable, the round uses the
  lexical ranking; the `method` of each row (`lexical` or `model:<id>`) and the decision log say which one ran.
  `AUDIT_MODEL=rules` (default, local and demo_mode only) writes the lexical ranking as a model response, so the
  whole path runs without a model call; set a Gemini model id (and Vertex or API-key credentials) to use the model.
- **One ADK session per case**, kept in this service's own database: `main.py` gives the agent ADK's
  `DatabaseSessionService` on the service's engine, so the tables `sessions`, `events`, `app_states`, `user_states`
  and `adk_internal_metadata` live in `case_audit` (created by ADK on first use, the one exception to "tables come
  from Alembic": ADK versions its own schema). Every round of the case appends what the agent was asked and what it
  answered; the session id is the case id and the user is the agent, never a person. Each round carries the whole
  case, so the model is not shown earlier rounds (`include_contents="none"`). Evals and unit tests run without a
  store, in memory.
- A hypothesis is not a finding: findings and `temuan.siap_validasi` come with the validation flow (#45).

## Witness interview

After each ranking, `interview.py` keeps up to 2 questions waiting for the reporter (at most 6 per case). Questions
come from the `witness_questions` of the pack's cause branches, best-ranked branch first, never twice
(`question` steps in the audit trail, `audit.question_asked` in the decision log). A rule, not a prompt: a model
that writes its own questions would use the same steps; this is the scripted fallback (T2).

- `GET /v1/witness/questions`: the questions waiting for me. Any signed-in reporter, anonymous included: the
  service matches the caller's pseudonymous `reporter_ref` (`Principal.reporter_ref`, the same for every service)
  against the reports of the case. It keeps no uid and no name, and a signal has nobody to ask.
- `POST /v1/cases/{case_id}/witness-answers`: one answer per question, only from the reporter of a report of the
  case (otherwise 404, a second answer 409). The answer is an `answer` step labelled `alleged` (the reporter's own
  word) with `question:<id>` and `report:<id>` references, an `audit.answer_received` decision, and a new round:
  the answer feeds the ranking of hypotheses but never lifts an evidence status.
- The Witness app shows them on SCR-006 (`apps/witness`, `VITE_CASE_AUDIT_URL`): a banner on every screen once the
  device has a question, a text answer per question, sent with the same anonymous device token as the report (TC-018).
  The browser calls this service directly, so `CORS_ORIGINS` must list the Witness origin. Answering by voice is not built.
- `case_sources.reporter_ref` (migration `0004`) is where the link lives; it is never part of an API response
  or the decision log.

## Pattern tests

"Why does it keep happening": after each ranking, every metric of the leading branches is tested for the group
values of the case's own reports (the kitchen, ...). Metrics are defined in the pack (`pattern_metrics`: `count_by`,
`sum_by`, `interval_minutes`, `violations_by`), implemented as fixed, parameterised kinds in
`libs/pack-core` (`agesoa_packs.metrics`). `patterns.check_pattern` takes a branch, one of that branch's metrics and
a window of 1-365 days; everything else is refused, so an agent calls a tool and never writes a query.

- A pattern **recurs** when a report of *another case* has the same group value. Then the `pattern_test` step is
  `supported` (capped by the case's maximum finding status) with `report:<id>` references to every incident
  counted; otherwise it is `alleged`: nothing was found, nothing is proven.
- Incidents are read through an `IncidentStore`: `DatabaseIncidentStore` (this service's own `case_sources`, no other
  database) is the default. A case is tested when a source joins it or its reporter answers; a case that an
  *older* case now recurs with is not retested until its next round.
- The decision log gets one `audit.patterns_tested` entry per round (counts only, no group value).

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
