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

## Domain pack rules and hypotheses

A rule in a domain pack may name the cause branch a violation is evidence for (`supports_branch`, must exist in
`cause_framework`). The core ranking of hypotheses adds a small bonus to that branch; the rule itself stays a
parameterised kind implemented in `libs/pack-core`.

`pattern_metrics` defines the cross-case metrics a cause branch may list (`cause_framework/branches/*/pattern_metrics`
holds their ids). A metric has a `kind` (`count_by`, `sum_by`, `interval_minutes`, `violations_by`) and `params`
that only name report fields (`group_by` must be a string field) or a rule; the kinds are implemented, fixed and
tested in `libs/pack-core`, so a pack can never carry a query.

## Rules

- A breaking change to an event creates a new version file (`.v2.schema.json`) and a catalog change; consumers
  accept both versions until every producer has moved.
- Event `data` never contains personal names or raw coordinates (`region` holds codes + names only).
- `synthetic: true` marks demo data; it is always shown openly as SIMULATION.
- Human-readable text written by an agent (finding `statement`, audit report `summary`, root cause `statement`,
  `recommendations`) may carry an optional `*_i18n` companion (`$defs/localized_text`: `{"id": …, "en": …}`,
  at least one language) so the portal can show it in the reader's language. The plain field stays required and
  is the source of truth; readers fall back to it and never machine-translate without a label. Adding the
  optional companion is not a breaking change (same `v1` files).

```powershell
uv run pytest packages/contracts   # schemas valid, catalog consistent, examples valid
```
