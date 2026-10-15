# examples/sim-instansi

Reference institution system: **SIM Badan Gizi Kabupaten Sukamaju (fictional)**. It shows how an agency
integrates with AGESOA: it receives signed audit reports by webhook, keeps them in an inbox with an internal
ticket number, and sends the follow-up status and a right of reply back through the AGESOA institution API.

Not part of the product and a fictional organisation: every page carries the band
`SIMULASI – organisasi fiktif`. It is standalone on purpose (no AGESOA packages; HMAC is checked with the
standard library) and is not a member of the root uv workspace, so it has its own `uv.lock`.

Contract: [`packages/contracts/webhook/README.md`](../../packages/contracts/webhook/README.md).

## Run locally

```sh
cd examples/sim-instansi
uv run uvicorn sim_instansi.main:app --port 8090
uv run pytest -q
uv run ruff check . && uv run ruff format --check .
```

Container (build context = this folder, listens on `PORT`, default 8080, user uid 10001):
`docker build -t sim-instansi examples/sim-instansi`.

| Env var | Meaning |
|---|---|
| `SIM_WEBHOOK_SECRET` | subscription secret used to verify `X-Agesoa-Signature` (unset → every webhook is `401 not_configured`) |
| `SIM_API_KEY` | AGESOA institution API key, sent as `Authorization: Bearer <key>` |
| `SIM_AGESOA_API_URL` | base URL of the AGESOA `delivery` service, e.g. `http://localhost:<delivery port>` |
| `SIM_DATA_FILE` | optional JSON file; when set, inbox, log, tickets and changed settings survive restarts (file mode 0600, it may hold the secret and key: demo only) |

Env vars are initial values; values saved on the settings page (or `POST /api/settings`) win and are persisted
in `SIM_DATA_FILE` when it is set.

## Subscribe the agency in AGESOA

1. Start this system where AGESOA can reach it.
2. AGESOA portal → organisation page of the agency → add a webhook subscription with URL `<sim>/webhook`.
3. Copy the secret (shown once) into **Settings → Webhook secret** of this system.
4. Create an API key for the organisation and paste it into **Settings → API key**; set **AGESOA API URL**.
5. Send a test event from the subscription screen: it appears in the inbox marked "Test event".

## Endpoints

| Method + path | Purpose |
|---|---|
| `POST /webhook` | webhook receiver (rules below) |
| `GET /` | SCR-080 inbox (internal ticket, case, status) |
| `GET /tickets/{ticket}` | SCR-080 detail + SCR-081 follow-up status and right-of-reply forms |
| `POST /tickets/{ticket}/status`, `POST /tickets/{ticket}/reply` | form targets; call `POST {AGESOA}/api/v1/cases/{case_id}/status` / `.../reply` and show the HTTP result |
| `GET /webhook-log` | every webhook request: accepted / duplicate / rejected + reason |
| `GET /settings`, `POST /settings` | demo settings form |
| `GET /api/settings`, `POST /api/settings` | settings as JSON; never returns the secret or key, only `*_set` flags |
| `GET /api/inbox`, `GET /api/webhook-log` | JSON for tests, newest first |
| `GET /healthz` | liveness |

`POST /api/settings` takes `{webhook_secret?, api_key?, agesoa_api_url?, fail_next?}`: omitted/null fields stay,
an empty string clears a value.

## Receiver rules

Checked in this order; every request is written to the webhook log.

| Condition | Response | Log |
|---|---|---|
| no secret configured | `401` | `rejected` / `not_configured` |
| `X-Agesoa-Signature` missing or not `v1=` + hex HMAC-SHA256(secret, `<timestamp>.<raw body>`) (constant-time compare) | `401` | `rejected` / `bad_signature` |
| `X-Agesoa-Timestamp` more than 300 s from the receiver clock, either direction (300 s accepted, 301 s rejected) | `401` | `rejected` / `stale_timestamp` |
| fail mode: `fail_next > 0` (decremented per request; only authentic requests count) | `500` | `rejected` / `forced_failure` |
| event id already processed | `200 {"internal_ticket": <original>}`, no second inbox item | `duplicate` |
| body not valid against the schema, or `event`/`event_id` differ from the headers | `400` | `rejected` / `invalid_body` |
| valid | `200 {"internal_ticket": "SIM-<n>"}`, report added to the inbox | `accepted` |

Fail mode lets you test AGESOA's retries: set **Fail next deliveries** to 2, send an event, and watch two
`forced_failure` rows followed by `accepted` once the retry arrives.
