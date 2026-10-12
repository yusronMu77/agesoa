# packages/contracts

Contracts shared by the services and apps. The JSON files here are the source of truth; code reads them.

| Path | Holds |
|---|---|
| `events/catalog.json` | every event type: schema file, producer, consumers. Drives Pub/Sub topics and push/BigQuery subscriptions (`infra/tofu`) and the local relay |
| `events/cloudevent.schema.json` | CloudEvents 1.0 structured-mode envelope + shared `$defs` |
| `events/<type>.v<n>.schema.json` | one schema per event type and version (`dataschema` = `urn:agesoa:schema:event:<type>:v<n>`) |
| `events/examples/` | one valid example per event type (synthetic data) |
| `webhook/` | institution webhook contract (HMAC signature, retries, idempotency) + body schema, institution API summary |
| `domain-pack/domain-pack.schema.json` | format of `domain-packs/<id>/pack.json` |
| `src/agesoa_contracts` | Python loader/validators used by `libs/platform-py` and the tests |

Service HTTP APIs are described by each service's `services/<svc>/openapi.json` (exported from code, see the
service README).

## Rules

- A breaking change to an event creates a new version file (`.v2.schema.json`) and a catalog change; consumers
  accept both versions until every producer has moved.
- Event `data` never contains personal names or raw coordinates (`region` holds codes + names only).
- `synthetic: true` marks demo data; it is always shown openly as SIMULATION.

```powershell
uv run pytest packages/contracts   # schemas valid, catalog consistent, examples valid
```
