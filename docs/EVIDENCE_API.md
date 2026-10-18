# QuantumPass evidence API — V2.1 preview

## Separate verdicts (never collapse them into a single "quantum verified" badge)

- **integrity: verified** — the receipt has valid Ed25519 and ML-DSA-65 signatures over `QuantumPass-hybrid-sig/1:ed25519+ml-dsa-65\x00 || canonical_json(payload)`, checked against an **independently trusted** public key.
- **provenance: operator-asserted** — source labels, IBM job identifiers, QRNG provider responses and health assessment are fields signed by QuantumPass. A valid signature establishes that the service signed these claims, **not** that the external source authenticated them.
- **quantum_evidence: none** — IBM does not sign the corresponding hardware job results as an independently verifiable certificate within this implementation.
- **server log inclusion** — a record currently exists in the server-controlled database; no Merkle inclusion proof or externally anchored signed checkpoint exists yet.

The v2 signed payload adds:

```json
"evidence": {
  "integrity": "hybrid-signature:ed25519+ml-dsa-65",
  "provenance": "operator-asserted",
  "quantum_evidence": "none"
}
```

Receipt version `qpg-receipt/1` remains verifiable. Verifiers must reject unknown versions, unknown key IDs, invalid schemas and malformed signatures. They should also validate key fingerprints against a trust root not retrieved solely from the service being tested.

## Offline verification

1. Preserve a receipt and the intended public-key fingerprints independently of QuantumPass.
2. Verify that the signature algorithms, domain separator, key fingerprint and canonical payload are consistent.
3. Verify **both** signatures. An unsigned `algorithms` array does not override the requirement.
4. If verifying a secret commitment, obtain the secret and salt privately and compare SHA-512 over the exact bytes; never submit a secret to public verification URLs.
5. For a draw, supply the *canonical entry list*. Verify the entries hash, the `selection.seed_hex`, the `qpg-select/1` algorithm and the selected indexes/entries. The draw record may be omitted or suppressed by the operator.
6. Report each assurance class separately; "signature valid" is not synonymous with "hardware attested".

## API

- `GET /.well-known/quantumpass-keys.json`: server-issued public keyring (not externally anchored).
- `GET /api/v2/receipts/{id}`: published server record, secret commitment only.
- `POST /api/v2/receipts/verify`: integrity verdict and optional commitment/entries/selection checks.
- `POST /api/v2/draws`: create signed commitment and draw atomically.
- `POST /api/v2/draws/{id}/run`: persist a seed before deterministic winner selection.
- `GET /api/v2/admin/audit`: MFA-admin audit events.
- `GET /api/v2/admin/audit/verify`: recompute local hash-chain integrity.

## Non-goals for V2.1

No operator-independent public beacon; no independently verifiable quantum-source attestation; no on-device customer-side entropy generation; no regulatory RNG certification. These are separate engineering, third-party integration and compliance projects.
