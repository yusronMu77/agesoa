# services/trust

Organizations, validators, staff confirmation, validation routing and quorum; agent Role.

Owns the Postgres database `trust`; no other service reads it. Generated from
`templates/service` (`.copier-answers.yml`).

| Path | Holds |
|---|---|
| `src/agesoa_trust/api.py` | public HTTP API (`/v1/...`) |
| `src/agesoa_trust/events.py` | handlers for the events routed here by `packages/contracts/events/catalog.json` |
| `src/agesoa_trust/quorum.py` | quorum rule, `needs_evidence` state and the one-final-decision rule (`may_decide`) |
| `src/agesoa_trust/deadline.py` | validation deadline from the domain pack (`validation.decision_window_hours`) |
| `src/agesoa_trust/tables.py`, `alembic/` | owned tables + migrations (`0001` = outbox/inbox, `0007` validation deadline, `0008` organization contact email) |
| `openapi.json` | published API contract, exported from code |

Platform endpoints (from `libs/platform-py`): `GET /healthz`, `GET /readyz` (own database reachable),
`POST /events/{type}` (Pub/Sub push, OIDC), `POST /internal/outbox/sweep`, `POST /internal/probe`.

## Validation decisions

`POST /v1/validation-requests/{finding_id}/decisions` takes `decision` = `approve` | `reject` | `needs_evidence`,
plus `note`, `confidence` (0..1) and `conflict` (declared conflict of interest) for every value.
`GET /v1/validation-requests` (nearest `deadline_at` first, requests without a deadline last) and
`GET /v1/validation-requests/{finding_id}` return `deadline_at`, `state` (`awaiting_decisions` | `needs_evidence`),
`evidence_requests` and the caller's `my_decision`; `quorum.evidence_requests` counts the open requests for evidence.

### Decision note: "Butuh bukti" (`needs_evidence`)

- Status: accepted, 2026-10-20 (SCR-020 / SCR-022: Setuju / Tolak / Butuh bukti)
- **Not a verdict.** `needs_evidence` ("ask for more evidence before deciding") never counts toward the
  approve/reject quorum, never blocks it and is never a rejection: two qualifying approvals still close the
  validation as approved, one counted rejection still returns the finding to the audit.
- **Recorded like every vote.** It is stored, published as `decision.recorded` (action
  `finding.evidence_requested`, actor = role label, reason "Validator asked for more evidence before deciding
  (not counted toward quorum). Note: …") and appended to the public hash-chained log by transparency.
- **A note is required** (422 without one): the request must say which evidence is missing.
- **Visible state.** While at least one *counted* validator (active or probation, no declared conflict) has
  `needs_evidence` as their current decision, the open validation is in state `needs_evidence` (queue chip
  "Butuh bukti"); otherwise `awaiting_decisions`. Every vote that does not close the validation publishes
  `validation.updated` (state, counted approvals / rejections / evidence requests, `deadline_at`; no validator
  reference) so the public pages show it; opening a validation publishes it too.
- **Replacement, once.** A validator's later `approve` or `reject` replaces their own `needs_evidence` (the row
  is updated, `replaced: true` in the response, the log keeps both entries; the new entry says "…, replacing
  their request for more evidence"). Asking for evidence twice, or changing an approve/reject, is 409:
  approve and reject stay final.
- **Outcome event unchanged.** `validation.completed` v1 lists only approve/reject decisions; an outstanding
  `needs_evidence` is not part of the outcome.
- The deadline is not extended by a request for evidence.

### Decision deadline (`deadline_at`, "Tenggat")

`deadline_at` = time of the `finding.ready_for_validation` event + the finding's domain pack
`validation.decision_window_hours` (mbg 72 h, general 120 h). It is data from the pack, not a promise of the
core (UX-040): a pack without the setting, or an unknown domain, gives `deadline_at: null`. It is computed once
when the validation opens (a later pack change does not move it); requests opened before migration `0007` have
none. The case's evidence deadline is not used: it measures how long physical evidence survives, not how long
validators have. A naive event time is rejected by the contract (400) and by `deadline.py` (`ValueError`).

## Organizations

`POST /v1/organizations` accepts an optional `contact_email` (SCR-060 "Email kontak", for finding
notifications; separate from the admin account's sign-in email). It is trimmed, its domain lowercased, a blank
value means none, an invalid address is 422. It is private: returned only to the organization's admin
(`GET /v1/organizations`, `GET /v1/organizations/{id}`, registration and DNS-check responses), never in an
event, the decision log, the newsroom list or any public page.

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
