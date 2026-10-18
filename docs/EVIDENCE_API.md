# Evidence API (V2.1)

The contract a security team needs to consume QuantumPass evidence without trusting our code: the receipt format,
what each part proves, how to verify it independently, and the endpoints. Reference verifiers:
`backend/scripts/verify_receipt.py` (Python, standalone) and `web/lib/verify/` (TypeScript, in the browser). Both
are checked against shared test vectors (`web/tests/vectors/receipts.json`).

## Three separate verdicts

Never collapse these into one "quantum verified" badge.

| Class | Value in v2 receipts | What it means |
|---|---|---|
| **Integrity** | `hybrid-signature:ed25519+ml-dsa-65` | Both signatures verify over the domain-separated canonical payload under a published, non-revoked key. Cryptographic; anyone can check it. |
| **Provenance** | `operator-asserted` | Sources, IBM job ids, quantum byte counts and health status are claims the service signed. A valid signature proves the service made the claims, **not** that the sources authenticated them. |
| **Quantum evidence** | `none` | No independently verifiable proof of quantum origin exists today: IBM does not sign job results. |

Log status is reported separately: `in_public_log` means the receipt is present in the **server-operated** log. There
is no Merkle inclusion proof or externally anchored checkpoint yet, and the operator could withhold records.

## Receipt format

```json
{
  "payload": {
    "version": "qpg-receipt/2",
    "receipt_id": "16 chars [A-Za-z0-9_-]",
    "issued_at": 1792304938,
    "kind": "password | passphrase | random | draw_commit | draw",
    "key_id": "16 hex: first 16 hex chars of SHA-256(ed25519_pk || mldsa65_pk)",
    "evidence": {"integrity": "hybrid-signature:ed25519+ml-dsa-65", "provenance": "operator-asserted",
                 "quantum_evidence": "none"},
    "provenance": {"sources": ["ibm_quantum", "anu"], "quantum": true, "quantum_bytes": 128,
                   "mixed_with": "os_csprng", "health": {"sp800_90b_style": "pass"},
                   "ibm_jobs": [{"backend": "ibm_...", "job_id": "...", "mode": "hardware"}]},
    "entropy_bits": 131.09,
    "commitment": "128 hex: SHA-512(salt || utf8(secret))  (secret kinds only)",
    "result": null,
    "details": {"length": 20}
  },
  "signatures": {"ed25519": "base64url", "ml-dsa-65": "base64url"},
  "algorithms": ["ed25519", "ml-dsa-65"]
}
```

Per-kind rules (enforced by the server's strict schema, `backend/app/receipt_schema.py`):

| Kind | `commitment` | `result` | `details` |
|---|---|---|---|
| `password`, `passphrase`, `random` | 128-hex commitment | `null` | `length` / `words` / `bytes` (small positive integers only) |
| `draw_commit` | `null` | `null` | `draw_id`, `title`, `entries_count`, `entries_sha256`, `winners` |
| `draw` | `null` | `{winners: [{index, entry}], selection: {algorithm: "qpg-select/1", seed_hex}}` | as `draw_commit` plus `commit_receipt_id`, optional `recovered: true` |

Unknown fields are rejected. `qpg-receipt/1` (issued before V2.1: no `evidence` block, draws without a selection
seed, health key `sp800_90b`) remains verifiable. `entropy_bits` is log2 of the output space the secret was sampled
from, not a measurement of physical entropy.

## Verification algorithm

1. **Parse losslessly.** Keep every number's original text: payloads are signed over Python's JSON, where `256.0`
   is not the same bytes as `256`. Reject duplicate keys.
2. **Check structure.** The version is supported; the fields are exactly those above; the kind rules hold; `issued_at`
   is not in the future (5-minute skew allowed); the v2 evidence block equals the constant above.
3. **Find the key** in the issuer's key set (`/.well-known/quantumpass-keys.json`, ideally a copy you obtained
   independently). Recompute `key_id` from the two public keys. A mismatch means a mislabelled key set.
4. **Check revocation.** A key with `status: "revoked"` invalidates receipts whose `issued_at >= revoked_at`.
   Earlier receipts stay valid.
5. **Build the message:** `"QuantumPass-hybrid-sig/1:ed25519+ml-dsa-65\x00"` followed by the canonical JSON of the
   payload: keys sorted by Unicode code point, separators `,` and `:`, no whitespace, non-ASCII characters
   unescaped (UTF-8), numbers exactly as received.
6. **Verify both signatures.** Ed25519 must verify under strict RFC 8032 rules (the strict mode of
   `@noble/curves`, or `cryptography`). ML-DSA-65 is FIPS 204 with an empty context. The receipt is valid only if
   **both** verify. The unsigned `algorithms` array never overrides this.
7. **Commitment (secret kinds, optional).** Given the secret and its base64url 32-byte salt, recompute
   `SHA-512(salt || utf8(secret))` locally. Never submit a secret to a public verification URL.
8. **Draws (optional).** Normalise the published entry list: NFC; trim Python-style whitespace; reject empty,
   over-200-character or control-character entries; sort by code point. Then check that SHA-256 of its compact JSON
   array equals `details.entries_sha256`. For v2 draws, recompute the winners with `qpg-select/1`:

   ```
   KeyStream(seed) = HMAC-SHA512(seed, counter as 8-byte big-endian) for counter = 0, 1, …, consumed in order
   uniform_index(n): k = 1 byte if n <= 256 else 2 bytes (big-endian); limit = 2^(8k) - (2^(8k) mod n)
                     read k bytes until value < limit; return value mod n
   winners: idx = [0 … N-1]; for i in 0 … w-1: j = i + uniform_index(N - i); swap(idx[i], idx[j]); return idx[:w]
   ```

   The winners must equal `[{index: idx[i], entry: entries[idx[i]]}]` in order.
9. **Report each class separately:** integrity valid/invalid (with reason), provenance as asserted, quantum
   evidence none.

`GET /api/v2/receipts/{id}/verify-material` returns the server's canonical payload string, the signing domain and
the key entry, for verifiers that can't parse losslessly. Since it comes from the same server, also cross-check it
against your own canonicalisation and an independent copy of the key set.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/v2/password`, `/passphrase`, `/random` (`?receipt=true`) | optional | Generate a secret; with `receipt=true`, also a signed receipt and its salt (returned only to the caller) |
| GET | `/api/v2/entropy/status` | none | Source status (coarse; no raw errors) |
| GET | `/api/v2/receipts/{id}` | none | A published receipt (commitments only, never secrets) |
| GET | `/api/v2/receipts/{id}/verify-material` | none | Byte-exact canonical payload, signing domain, key entry |
| POST | `/api/v2/receipts/verify` | none | Server verdicts for `{receipt}` or `{receipt_id}`; optional `value` + `salt`, `entries` |
| GET | `/.well-known/quantumpass-keys.json`, `/api/v2/receipts/keys` | none | Active, retired and revoked public keys |
| POST | `/api/v2/draws` | signed in* | Commit a draw (entries, title, winners) and get the `draw_commit` receipt |
| POST | `/api/v2/draws/{id}/run` | owner | Run once; replays the published result afterwards |
| GET | `/api/v2/me`, `/me/receipts`, `/me/usage` | signed in | Account overview, receipt metadata (paginated), usage and quotas |
| GET | `/api/v2/admin/audit`, `/admin/audit/verify`, `/admin/draws/investigate` | admin + MFA | Audit log, chain verification, interrupted draws |
| POST | `/api/v2/admin/draws/{id}/complete` | admin + MFA | Complete an interrupted draw from its persisted seed |

\* In development mode the backend signs everyone in as a local admin.

**Idempotency.** `Idempotency-Key: <8–64 chars of A–Z a–z 0–9 _ ->` on `POST /api/v2/draws` and
`POST /api/v2/draws/{id}/run`. The same key with the same body replays the stored response, with the header
`Idempotent-Replayed: true`. The same key with a different body returns `422`. Keys are scoped per caller and kept
for 7 days.

**Errors.** JSON `{"detail": "..."}` (or a validation list). Every response carries `X-Request-ID`; quote it when
reporting a problem. `429` means rate-limited. `409` on a draw run reports a draw that is `seeded` or
`needs_investigation`; it is never re-run with fresh randomness (see [DRAWS.md](DRAWS.md)).

**Caching.** Every API response is `Cache-Control: no-store`.

## Not in V2.1 (roadmap)

- An operator-independent public randomness beacon mixed into draw seeds (e.g. drand).
- An externally anchored transparency log with inclusion proofs.
- A customer-hosted SDK or sidecar that generates locally and sends only commitments (design in progress for V3).
- Independently verifiable quantum-source attestation. This needs provider cooperation and is not available today.
- Any regulatory RNG certification.
