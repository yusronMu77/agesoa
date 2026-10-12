# libs/platform-py (`agesoa_platform`)

Technical building blocks shared by the 5 services. **No domain logic**: no rule, threshold, status or
wording that belongs to a domain lives here.

| Module | Provides |
|---|---|
| `settings` | `ServiceSettings` from env vars; `demo_mode` (off by default, refused when `ENVIRONMENT=prod`); OIDC config required outside `local`/`test` |
| `demo` | `require_demo_mode` dependency: demo-only routes answer 404 when the flag is off |
| `db` | async SQLAlchemy engine (asyncpg, small pool) per service database; `check()` reports the database actually reached |
| `messaging_tables`, `migrations` | `outbox` + `inbox` tables (created by each service's first migration), shared Alembic `env.py` body with an advisory lock |
| `events` | `new_event()`: CloudEvent built and validated against `packages/contracts` before it can be stored |
| `outbox`, `pubsub` | transactional outbox (`add_event` in the unit of work, `OutboxDispatcher.dispatch` after commit and from the sweep), Pub/Sub publisher (topic = event type) |
| `inbox`, `push` | `POST /events/{type}` Pub/Sub push endpoint: OIDC caller check, contract validation, handler runs once per event id |
| `oidc`, `auth` | Google OIDC for service callers (push, scheduler); Identity Platform ID tokens + role claims for users |
| `hashing`, `hmac` | canonical JSON, SHA-256, hash chaining; webhook HMAC signing/verification (5-minute tolerance) |
| `observability` | JSON logs for Cloud Logging with trace correlation; OpenTelemetry → Cloud Trace |
| `app` | `create_app()`: `/healthz`, `/readyz`, `/internal/outbox/sweep`, `/internal/probe`, push router, CORS |
| `devtools.relay` | `agesoa-dev-relay`: emulator topics/subscriptions from the catalog + local push forwarding |

Local-only relaxations (unsigned push from the relay, `Bearer dev:<uid>:<roles>` user tokens) exist only when
`ENVIRONMENT` is `local` or `test`.

```powershell
uv run pytest libs/platform-py                     # unit tests
$env:TEST_DATABASE_URL = "postgresql+asyncpg://..."  # optional: outbox/inbox tests against a real Postgres
```
