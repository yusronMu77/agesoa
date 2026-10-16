# domain-packs/mbg

First domain pack: food safety in the free school meal program (Makan Bergizi Gratis, MBG). It is the demo
case, not the product: everything MBG-specific lives in [`pack.json`](pack.json), and the core engine
(`libs/pack-core`) only evaluates it.

| Section | Content |
|---|---|
| `categories` | poisoning, spoiled food, short portion, kitchen hygiene |
| `report_fields` | school, kitchen (SPPG), menu, cooked at (from the tray label), eaten at, meal date, symptoms, people affected, tray label text |
| `rules` | `consume_within_4h`: eaten at most 240 minutes after cooking (exactly 4:00 passes) |
| `evidence_deadline` | food samples are kept 2×24 h **counted from cooking time** (fallback: 00:00 of the meal date); after that the highest reachable finding status is *supported* |
| `cause_framework` | fishbone: ingredients, process, people, facility, distribution, oversight, with hypothesis seeds, witness questions and cross-case metrics for the Audit agent |
| `pattern_metrics` | cross-case metrics per kitchen (reports, distinct schools, meal days, minutes from cooking to eating, 4-hour violations). No supplier metric: reports carry no supplier field yet |
| `validator_roles` | nutritionist, health worker, journalist, education watchdog NGO |
| `signal_sources` | keywords + official publishers for the Signal agent |
| `evidence_tips` | shown to the reporter while evidence is still available |

Format: `packages/contracts/domain-pack/domain-pack.schema.json`. Tests pin the rule boundaries:

```powershell
uv run pytest domain-packs/mbg
```

## Synthetic scenarios

`scenarios/*.json` holds six fictional cases (Kabupaten Sukamaju, no administrative codes, every place marked
"(fictional)"), each with a different planted root cause and an answer key:

| Scenario | Planted root cause (cause branch) | 4-hour rule violated |
|---|---|---|
| `mbg-s01-long-route` | delivery route too long for one kitchen (distribution) | yes |
| `mbg-s02-supplier-cold-chain` | cheaper supplier without a cold chain (ingredients) | no |
| `mbg-s03-staff-turnover` | untrained replacement crew (people) | no |
| `mbg-s04-broken-chiller` | chiller broken for three weeks (facility) | no |
| `mbg-s05-uncertified-kitchen` | uncertified kitchen, earlier incidents closed as one-offs (oversight) | yes |
| `mbg-s06-coconut-menu` | coconut-milk dishes under a one-size holding time (process) | no |

Each also plants a misleading explanation (`answer_key.distractors`). The format is
`packages/contracts/domain-pack/scenario.schema.json`; loading recomputes the rule violations, so a scenario
cannot claim a violation its data does not show. The ingestion service serves them (without answer keys) only
with `demo_mode` on; agent evals use the answer keys (the planted root cause should rank in the top 3).
