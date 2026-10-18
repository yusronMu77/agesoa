# ADR-0005: Decision log hash chain format

- Status: accepted
- Date: 2026-10-13
- Issues: #42 (hash-chained decision log), #43 (public read model)

## Context

Every decision in AGESOA (an agent's finding, a rule result, a validator's vote, an institution's follow-up)
is recorded in a public decision log. The log must let anyone, not only AGESOA, check that no entry was
changed, removed or inserted afterwards. That is only possible if the exact bytes that are hashed are
specified, so an independent implementation (the QA suite, a journalist, an auditor) gets the same hashes.

## Decision

1. **Single writer.** Only the `transparency` service writes the log. Other services publish a
   `decision.recorded` event (schema `packages/contracts/events/decision.recorded.v1.schema.json`); the
   service appends it inside the inbox transaction, so a redelivered event is appended once.
2. **Entry.** Entry `n` is the JSON object

   ```json
   {"seq": n, "event_id": "<CloudEvent id>", "source": "<CloudEvent source>",
    "type": "<CloudEvent type>", "decision": <CloudEvent data>, "recorded_at": "<UTC, ISO 8601, Z>"}
   ```

   `decision` carries the actor (`kind` = agent | rule | human | system, `name` = agent name, rule id or role
   label, never a person's name), `action`, `subject`, `reason`, `evidence_refs` and `status_label`.
3. **Canonical JSON.** Keys sorted (by code point), separators `,` and `:` with no whitespace, UTF-8 with
   non-ASCII characters written as is (not `\u` escaped), no `NaN`/`Infinity`. Equivalent to Python
   `json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)`.
4. **Hash.** `hash_0` is 64 zeros. `hash_n = SHA-256( hash_{n-1} + "." + canonical_json(entry_n) )`, where
   `hash_{n-1}` is the lowercase hex string (64 ASCII characters) and the result is lowercase hex.
5. **Ordering.** `seq` starts at 1 with no gaps. Appends lock the single `chain_head` row
   (`SELECT ... FOR UPDATE`), so the chain never forks even with several instances.
6. **Append-only.** A database trigger rejects `UPDATE` and `DELETE` on `decision_log`.
7. **Verification.** Public, unauthenticated:
   - `GET /v1/log?after=<seq>&limit=<n>` returns `entry`, `prev_hash` and `hash` per item, so a client can
     recompute the chain itself;
   - `GET /v1/log/verify` recomputes the whole chain server-side and reports `first_invalid_seq` and a reason
     (`sequence gap`, `prev_hash does not match the previous entry`, `hash does not match the entry`,
     `chain head does not match the last entry`);
   - `GET /v1/log/head` returns the current tip (`seq`, `hash`), which can be published elsewhere as an
     external anchor later.
8. **Read model.** The Firestore read model (`public_log/{seq}`) copies `prev_hash` and `hash` but is never
   the source of truth; verification always runs against the API above.

Reference implementation: `libs/platform-py/src/agesoa_platform/hashing.py` (`canonical_json`,
`chain_hash`), `services/transparency/src/agesoa_transparency/chain.py`. Independent implementation used as
a check: the QA suite recomputes every hash in TypeScript (test case TC-024).

## Consequences

- Any change to the entry fields, the canonical form or the hash formula breaks verification of existing
  entries; it needs a new ADR and a versioned chain, not an edit in place.
- `recorded_at` is part of the hashed entry, so the time of recording cannot be changed afterwards.
- The log is tamper-evident, not tamper-proof: someone with database superuser rights could rewrite the whole
  chain consistently. Publishing the head hash outside AGESOA (an external anchor) closes that gap and is on
  the roadmap.
- Person names never belong in a decision (`actor.name` is a role or agent); public read models are checked
  for person names (TC-028).
