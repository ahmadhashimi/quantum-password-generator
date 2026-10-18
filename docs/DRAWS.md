# QuantumPass V2.1 — Draw Integrity and Recovery

## Trust boundary

QuantumPass signs the entry-list commitment before it consumes randomness. The signed receipt is **operator-issued evidence**, not an independent proof of quantum entropy or an immutable public timestamp. The private database is writable by the operator. The audit hash chain detects changes to a recorded event unless an attacker is capable of rewriting the chain; external signed checkpoints are a V3 requirement.

## Once-only state transitions

1. `committed`: canonical entries and signed commitment are inserted in **one database transaction**.
2. `seeded`: one 64-byte selection seed, drawn from the mixed entropy stream, is atomically persisted with its reported provenance while claiming the committed draw. Selection may not begin unless this write succeeds.
3. `done`: deterministic partial Fisher-Yates selection is calculated from `KeyStream(seed)`, then the result receipt and final draw status are committed in **one transaction**.
4. `needs_investigation`: on restart, a draw left `seeded` is not run again. An MFA-verified administrator may recalculate using precisely the **same persisted seed**, write the result receipt, and record an audit event. No new entropy is consumed.

The seed is **public draw-verification material**, not a signing or authentication secret. It appears in the signed result receipt's `details.selection.seed_hex`. A copy of the **full entries list** is needed to verify the selection offline. Do not publish it without participant consent.

## Crash matrix

| Crash point | Persistent state | Next action |
|---|---|---|
| Before commitment transaction | No draw and no receipt | Caller may submit a new draw |
| During commitment transaction | Both inserted or neither | Query ID; do not assume success |
| Entropy drawn but claim transaction fails | `committed`, seed discarded | Retry generates a new seed; no selection happened |
| After seed persisted but before result | `seeded` | Restart marks `needs_investigation`; MFA admin completes with same seed |
| During result transaction | `seeded` or `done` atomically | Inspect and recover, never reseed |
| After final transaction but before HTTP response | `done` | Retrieve published receipt; never execute again |

## Limits and unresolved work

- Operator can still select when to run a draw, withhold completed results, omit or alter publication, or rewrite the DB/log; the current design is **not operator-independent fairness**.
- A malicious operator with DB access can inspect the seed before publishing the result.
- Selection verification must check the signed seed, canonical entries hash, calculated indexes, and each published winning entry.
- This branch does **not yet** implement client idempotency keys or independent transparency checkpoints.
- This branch has **not yet** migrated the DB to PostgreSQL or established deployment backups.
- A local hash-chained audit record is not an externally anchored append-only log.
- Do not market this as certified gambling, independently certified quantum randomness, or immutable transparency.

## Release gate

Run the SQLite and PostgreSQL suites, inject failures at every transaction boundary, exercise competing callers, verify recovery results and signatures, and perform a full backup/restore rehearsal. Without all checks, keep the PR in draft.
