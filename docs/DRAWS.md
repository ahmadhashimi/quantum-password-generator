# Draws: protocol, execution guarantees and recovery

A QuantumPass draw picks winners from a published entry list in two signed steps, so the list can't change
after randomness is known and every re-roll stays visible. Since V2.1, a committed draw executes **at most
once**, retries never draw fresh randomness, and anyone can recompute the winners from the receipt.

## Protocol

1. **Commit**: `POST /api/v2/draws` with `{title, entries, winners}` and an optional `Idempotency-Key`.
   - Entries are NFC-normalised, trimmed, checked for control characters and case-insensitive duplicates,
     then **sorted**. Winner indexes refer to this canonical order, so shuffling the list can't disguise a
     re-roll.
   - The server issues a signed `draw_commit` receipt with `entries_sha256` (SHA-256 of the compact JSON
     array), the entry count and the winner count. It contains no randomness.
   - The receipt row, the draw row (`status = committed`), the idempotency record and the `draw.commit`
     audit event are written in **one transaction**. Either all of them exist or none do.
2. **Run**: `POST /api/v2/draws/{draw_id}/run` (owner only; anyone else gets `404`).
   - The server takes a 64-byte selection seed from the entropy service (quantum sources mixed with the OS
     CSPRNG; see [ENTROPY.md](ENTROPY.md)).
   - **Claim**: one conditional `UPDATE … SET status = 'seeded', seed_hex = …, seed_provenance = …
     WHERE status = 'committed' AND owner_id = …`. The seed is persisted in the same statement that claims
     the draw, before any winner is computed. A concurrent run that loses the race writes nothing, and its
     seed is discarded unused.
   - Winners are a pure function of `(seed, canonical entries, count)` (`qpg-select/1`, below).
   - **Finish**: the signed `draw` receipt is saved, the draw becomes `done`, and the `draw.run` audit event
     is written in one transaction.
3. **Verify**: `GET /verify/{receipt_id}` (Proof Explorer), `POST /api/v2/receipts/verify`, or offline with
   `backend/scripts/verify_receipt.py`. Verification reports how many draws the same owner (and anyone) ran
   over the same `entries_sha256`, and how long the list was committed before the run.

## State machine

```
            commit (1 tx)              claim + persist seed (1 stmt)        receipt + done (1 tx)
  (none) ───────────────► committed ───────────────────────────► seeded ──────────────────────► done
                                                                    │
                                    startup recovery finds it seeded │
                                                                    ▼
                                                           needs_investigation ──► done (admin, from the persisted seed)
```

| Status | `POST …/run` returns | Draws randomness? |
|---|---|---|
| `committed` | runs the draw | yes, exactly once (only the claim winner's seed is used) |
| `seeded` | `409 {"status": "seeded"}` | **no** |
| `needs_investigation` | `409 {"status": "needs_investigation"}` | **no** |
| `done` | `200`, the original receipt, `"replayed": true` | **no** |

## Idempotency keys

`Idempotency-Key: <8–64 chars of A–Z a–z 0–9 _ ->` on commit and run. Keys are unique per
`(owner, endpoint, key)` and enforced by a database constraint:

- Same key, same body → the stored response, with header `Idempotent-Replayed: true`.
- Same key, different body → `422`.
- Concurrent requests with the same key → one wins. The others hit the unique constraint, roll back, and
  replay the winner's response.
- Records are purged after 7 days. A `done` draw replays its result without a key anyway.

## Selection algorithm: `qpg-select/1`

Published in every v2 draw receipt as `result.selection = {"algorithm": "qpg-select/1", "seed_hex": …}`.

```
KeyStream(seed) = HMAC-SHA512(seed, counter_be64) for counter = 0, 1, 2, …, bytes consumed in order
uniform_index(n): k = 1 byte if n ≤ 256 else 2 bytes (big-endian); limit = 2^(8k) − (2^(8k) mod n);
                  read k bytes until value < limit; return value mod n
winners: idx = [0 … N−1]; for i in 0 … w−1: j = i + uniform_index(N − i); swap idx[i], idx[j]; return idx[:w]
```

The indexes refer to the sorted, normalised list. Reference implementations: `select_winners()` in
`backend/app/generator.py` and an independent one in `backend/scripts/verify_receipt.py`. Tests check that
they agree.

## Recovery rules

The service runs as a single instance, so any draw still `seeded` at startup was interrupted between the
claim and the finish (crash, deploy, kill).

1. **Startup** (`mark_stuck_draws`): every `seeded` draw becomes `needs_investigation`, with a
   `draw.needs_investigation` audit event and a warning in the logs. It is **never re-run automatically**.
2. **Investigate**: `GET /api/v2/admin/draws/investigate` (admin, MFA) lists them with their persisted seed
   provenance and timestamps. Check the logs (by request ID) and the audit log around `run_started_at`.
3. **Complete**: `POST /api/v2/admin/draws/{draw_id}/complete` recomputes the winners from the
   **persisted** seed with zero fresh randomness. The result is exactly what the interrupted run would have
   published. The receipt carries `details.recovered: true`, and the audit event is
   `draw.admin_complete` with the admin as actor.
4. If the persisted seed itself is suspect (for example, the database was restored from a backup taken
   mid-run), do **not** complete the draw. Leave it in `needs_investigation`, tell the owner, and have them
   commit a new draw. The re-roll counter will show it.

Cases that need no action:

- The entropy fetch succeeded but the claim failed: nothing was persisted, the draw is still `committed`,
  and the unused seed is discarded.
- The claim succeeded but signing or saving the receipt failed: the draw is `seeded` and refuses to run
  again. It becomes `needs_investigation` at the next startup. Operators can restart the service or run the
  same recovery from a shell (`python -c "from app import db; print(db.mark_stuck_draws(0))"`).

## Limits and what a receipt does not prove

- The server chooses the seed at run time. A dishonest operator with database access could compute winners
  for many seeds privately and publish only one. Receipts make every **published** re-roll visible, but they
  can't reveal draws that were never issued. Planned mitigation: commit to a seed hash in the `draw_commit`
  receipt and derive the final seed from it together with a future public beacon round (drand), fixed at
  commit time, so neither party controls the outcome.
- Seed provenance (which quantum sources contributed) is operator-asserted, as for all receipts.
- This is not a certified RNG. It must not be used for regulated gambling or lotteries (GLI-19 and similar
  require lab certification).
