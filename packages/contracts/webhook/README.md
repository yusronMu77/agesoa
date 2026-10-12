# Institution webhook contract (v1)

AGESOA pushes audit reports to institutions that subscribed to a region + category (service `delivery`).
The receiver is the institution's own system; `examples/sim-instansi` is a reference receiver.

## Request

```http
POST <webhook_url>
Content-Type: application/json
X-Agesoa-Event: audit_report.final
X-Agesoa-Event-Id: 0b6f0a3e-7c1e-4d55-9a8e-2f4d2b8f1c11
X-Agesoa-Timestamp: 1760500000
X-Agesoa-Signature: v1=<hex HMAC-SHA256(secret, timestamp + "." + raw_body)>
```

- `X-Agesoa-Event`: `audit_report.final` or `test_event` (same body shape, sent from the subscription screen).
- `X-Agesoa-Event-Id`: unique per delivery attempt group; identical across retries of the same event.
- `X-Agesoa-Timestamp`: Unix seconds at signing time.
- `X-Agesoa-Signature`: `v1=` + lowercase hex of HMAC-SHA256 with the subscription secret over the bytes
  `<timestamp>.<raw body>`. The secret is shown once when the subscription is created and stored in
  Secret Manager on the AGESOA side.

Body: [`audit-report-final.schema.json`](audit-report-final.schema.json).

## Receiver rules

The receiver MUST answer:

| Condition | Response |
|---|---|
| signature does not match | `401` |
| timestamp more than **300 seconds** away from the receiver's clock (either direction) | `401` |
| `X-Agesoa-Event-Id` already processed | `200` with the original `internal_ticket` (idempotent, no second effect) |
| valid | `200` + `{"internal_ticket": "<id in the receiver's system>"}` |

Compare signatures in constant time. Reference implementation: `agesoa_platform.hmac` (`sign_webhook`,
`verify_webhook`).

## Sender behaviour

- Delivered through Cloud Tasks; any non-2xx or timeout (10 s) is retried **3 times** with increasing delay
  (30 s, 2 min, 10 min), then marked failed in `deliveries`.
- Every attempt is logged (`deliveries`: event id, HTTP status, attempt number) and the successful one
  publishes `laporan_audit.dikirim`.

## Institution API (institution → AGESOA)

`Authorization: Bearer <api_key>` (only the key hash is stored). Served by `delivery`; see
`services/delivery/openapi.json`.

| Endpoint | Body | Effect |
|---|---|---|
| `POST /api/v1/cases/{case_id}/status` | `status` (`received`/`in_progress`/`done`), `note`, `internal_ticket` | stores the follow-up, logs a decision, shown on the public dashboard |
| `POST /api/v1/cases/{case_id}/reply` | `body`, `attachments[]` | stores a labelled right of reply, logs a decision, shown next to the finding |
