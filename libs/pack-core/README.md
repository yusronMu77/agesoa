# libs/pack-core (`agesoa_packs`)

The core engine's view of a domain: it loads `domain-packs/<id>/pack.json`, validates it against
`packages/contracts/domain-pack/domain-pack.schema.json` plus cross-reference checks, and evaluates the
pack's rules and evidence deadline with generic, tested code. Nothing here knows about a specific domain;
packs only set parameters.

```python
from agesoa_packs import load_pack, evaluate_rules, evidence_status

pack = load_pack("domain-packs/mbg")
results = evaluate_rules(pack, fields)  # list[RuleResult]
status = evidence_status(pack, fields, received_at)  # EvidenceStatus
```

Rule kinds (`rules[].kind`):

| Kind | Params | Violated when |
|---|---|---|
| `max_interval` | `from_field`, `to_field` (datetime fields), `max_minutes` | `to - from` is longer than `max_minutes` (exactly `max_minutes` passes) |

Evidence deadline: counts `hours` from `anchor_field` (or from 00:00 local time of `fallback_anchor_field`);
a report received at exactly the deadline still counts as evidence available.

A broken pack fails at load time with `PackError`, listing every problem with its JSON path.

Synthetic scenarios (`<pack>/scenarios/<id>.json`, schema `scenario.schema.json`): `load_scenarios(pack)`
validates each one against the pack (categories, fields, cause branches) and recomputes the rule violations
its answer key claims. `Scenario.public_view()` drops the answer key.

```powershell
uv run pytest libs/pack-core
```
