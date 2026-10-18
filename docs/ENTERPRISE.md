# Enterprise positioning (internal)

Business notes, not marketing copy. Prospect names here are **strategic prospects, not leads**: nobody has been
contacted, and none of them appear on the website. All price ranges are **illustrative, not quotes**.

## Positioning

QuantumPass as an **embedded cryptographic evidence system** for companies that issue credentials or keys at scale,
or that must prove a fair outcome:

> Keep your existing secrets infrastructure. Add QuantumPass to make credential issuance independently auditable,
> with post-quantum signed evidence and transparent security guarantees.

What we sell is portable, verifiable evidence, with honest labels:

- integrity (hybrid Ed25519 + ML-DSA-65 signatures anyone can verify offline);
- operator-asserted provenance (sources and IBM jobs, signed but not independently proven);
- no claim of independent quantum attestation, and no certification claims.

No black box: the receipt format, the verification algorithm ([EVIDENCE_API.md](EVIDENCE_API.md)) and two
independent reference verifiers are public.

## Strategic prospects (not leads)

| Stage | Company type | Examples | Why they might care |
|---|---|---|---|
| 1 | Secrets-management platforms | Akeyless, Infisical, Doppler | Issue credentials at volume; customers ask auditors' questions ("where did this key come from?"); a receipt per issuance is a differentiating audit feature |
| 2 | Digital-asset custody / key infrastructure | Fireblocks, BitGo, Keyfactor | Key ceremonies and certificate issuance where evidence of process matters; longer security reviews |
| 3 | Promotion and giveaway platforms | ViralSweep, SweepWidget | Disputed draws; commit-then-run with public selection proofs answers "was it rigged?" |

## Honest competitive notes

- **Quantinuum Quantum Origin** is deployed with large enterprises (per Quantinuum: Wells Fargo, Thales, Keyfactor,
  Honeywell) and, per Quantinuum, holds a NIST entropy-source validation. We don't compete on certification or source assurance.
- **Easypromos** holds GLI-19 v3.0 certification for its draw engine. We don't claim anything equivalent and must
  not be used for regulated gambling.
- **random.org** has sold third-party draws for decades. Our difference is per-result, post-quantum-signed evidence
  with offline verification, not "more random".

## What a large contract needs first

1. An independent security review (cryptographic design and penetration test), published as a summary.
2. A customer-hosted option (V3 SDK or sidecar: local mixing, commitment-only receipts, no secrets leave the
   customer). Design only in V2.1. The brief forbids duplicating generation logic in the web tier.
3. An externally anchored transparency log for receipts.
4. Support, SLAs, DPA and a security questionnaire pack.

## Illustrative ranges (not quotes)

| Offer | Illustrative range | Notes |
|---|---|---|
| 30-day technical evaluation | free | Evidence API access, integration call, verification walkthrough |
| Pilot (one product line) | low five figures per year | Volume-capped receipts, shared infrastructure |
| Platform agreement | mid five to low six figures per year | Customer-hosted option (V3), anchored log, SLA |

## Outreach readiness checklist

- [ ] V2.1 merged and deployed with a passing restore drill and smoke test
- [ ] Real IBM hardware run verified offline (controlled beta)
- [ ] Independent review scheduled
- [ ] One-page technical brief derived from EVIDENCE_API.md
