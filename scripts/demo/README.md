# scripts/demo

`reset_demo.py` puts a **demo** environment back into a known state with one command: it empties every
service's database, seeds each service's own demo data again, then sends the synthetic scenarios of the
domain packs through the public API (the same calls AGESOA Witness makes), so cases and decision-log entries
come from the real event path.

```sh
# local devenv: five services on :8001-:8005 with DEMO_MODE=true, relay running (agesoa-dev-relay)
export API_URL_INGESTION=http://localhost:8001 API_URL_CASE_AUDIT=http://localhost:8002 \
       API_URL_TRUST=http://localhost:8003 API_URL_DELIVERY=http://localhost:8004 \
       API_URL_TRANSPARENCY=http://localhost:8005
uv run python scripts/demo/reset_demo.py

# any other environment: refuses without --yes; needs FIREBASE_WEB_API_KEY and AGESOA_OPS_SA
uv run python scripts/demo/reset_demo.py --yes
```

Options: `--scenarios mbg-s01-long-route,mbg-s02-supplier-cold-chain`, `--no-seed` (reset only), `--wait <seconds>`.

## Guarantees

- **Demo only.** `POST /internal/demo/reset` does not exist (404) unless `demo_mode` is on, and `demo_mode` is
  refused in `prod`. The script also checks `demo_mode` on every service before it changes anything.
- **Each service resets its own database** (data, outbox, inbox) and seeds its own demo data; nothing reads
  another service's database. Order: the four other services together, then `transparency`.
- **The public log restarts, and says so.** `decision_log` is append-only everywhere else. In a demo reset
  `transparency` empties it, restores the genesis head and appends entry 1, `demo.reset` (actor `system`).
  The chain verifies from there (`GET /v1/log/verify`).
- **Not touched:** media files already uploaded, BigQuery's `agesoa_events.events`, Firebase Auth accounts.

## What is not seeded yet

Signals ("kejadian berita"): the `signals` table has no writer until the Signal agent exists (#32).

## Test data vs demo data

The QA suite (`agesoa-e2e`) never writes to a demo environment; it runs against the local devenv. This script
is the only thing that writes demo data, and only after it empties the environment.
