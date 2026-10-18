# Entropy: sources, assumptions and limits

This document lists every assumption the entropy pipeline makes, where it lives in the code, and what it
does **not** guarantee. It is the reference for the "Entropy" section of `/transparency`.

**Not a certification.** QuantumPass implements the *continuous health tests* (Repetition Count Test and
Adaptive Proportion Test) described in NIST SP 800-90B §4.4. That is not an SP 800-90B validation, not an
Entropy Source Validation (ESV) certificate, and not FIPS 140-3. No part of this system has been certified by
NIST or any lab. Do not describe it as "NIST-certified", "SP 800-90B compliant" or "FIPS".

## Pipeline

```
IBM QPU job (H + measure, all qubits) ──► raw-bit RCT/APT (h = 2 bits/byte) ──► SHA-256 conditioning 4:1 ──► pool
ANU / LfD QRNG (HTTPS)                ──► RCT/APT (h = 7 bits/byte) ──────────────────────────────────────► buffer
                                                                                                             │
per request: 64 B from pool (signed-in users, quota) + 64 B from one live QRNG (if healthy) ─┐               │
                                                         os.urandom(64), always ─────────────┤◄──────────────┘
                                                                                             ▼
                                         HKDF-SHA512(ikm = quantum ‖ urandom, info = "quantum-password-generator/v2")
                                                                                             ▼
                                                    64-byte key ──► HMAC-SHA512 counter-mode keystream
                                                                                             ▼
                                                rejection sampling ──► password / passphrase / bytes / draw indexes
```

## Assumptions, with code locations

| # | Assumption | Code | Status |
|---|---|---|---|
| A1 | ANU and LfD deliver post-processed output with ≥ 7 bits of min-entropy per byte | `LIVE_MIN_ENTROPY` in `backend/app/entropy/service.py` | **Assumed** from the providers' published descriptions; not measured by us |
| A2 | Raw IBM QPU bits carry ≥ 2 bits of min-entropy per byte despite readout bias and crosstalk | `RAW_MIN_ENTROPY` in `backend/app/entropy/ibm.py` | **Assumed**, deliberately conservative; not an SP 800-90B §6 estimate on our data |
| A3 | SHA-256 truncated to 16 bytes over each 64 raw bytes extracts the raw min-entropy | `condition()` in `backend/app/entropy/mixer.py` | At A2's 2 bits/byte, 64 raw bytes carry 128 bits, and 16 output bytes need 128: a 1:1 claim with **no safety margin**. SP 800-90B §3.1.5 would only credit *full* entropy with 64 extra input bits. We do not claim the conditioned IBM bytes are full-entropy |
| A4 | `os.urandom` is a sound CSPRNG | `derive_key()` in `mixer.py` | Standard assumption; Linux `getrandom(2)` |
| A5 | HKDF-SHA512 extracts a uniform key if *either* input has enough min-entropy (≥ 256 bits) | `derive_key()` | Standard extractor assumption (HMAC as a randomness extractor, RFC 5869 §3). This is why, under these assumptions, output should not fall below the OS CSPRNG baseline |
| A6 | HMAC-SHA512 in counter mode is a secure PRF-based generator for one request's output | `KeyStream` in `mixer.py` | Sound construction, but **not** SP 800-90A HMAC_DRBG (no reseed or prediction-resistance machinery). Each stream lives for one request |
| A7 | Rejection sampling yields uniform indexes | `uniform_index()` in `backend/app/generator.py` | Exact: values ≥ ⌊2^(8k)/n⌋·n are rejected, so there is no modulo bias. Tested |
| A8 | A source that fails a health test contributes nothing to that request | `_refill()` in `service.py` | Enforced and tested. Failing batches are dropped and the circuit breaker opens after 3 failures |

## What the health tests can and cannot detect

The cutoffs follow SP 800-90B §4.4 with false-positive rate α = 2⁻²⁰ and APT window W = 512 (non-binary
samples). They are computed in `backend/app/entropy/health.py`:

| Source | Assessed h | RCT cutoff | APT cutoff (W = 512) |
|---|---|---|---|
| ANU, LfD | 7 bits/byte | 4 | 18 |
| IBM raw bits (as bytes) | 2 bits/byte | 11 | 178 |

SP 800-90B intends these tests to run **inside** the entropy source, on raw noise samples. ANU and LfD send
already post-processed output over HTTPS, so running RCT/APT on it detects **gross failures only**: stuck or
constant output, truncated or zero-filled responses, heavy bias. It cannot tell real quantum output from a
good PRNG, and it cannot detect a provider that is compromised but statistically clean. IBM raw bits are
closer to the noise source, so the tests there are more meaningful, but they still run on measurement
results we received over the network, not on the hardware.

`backend/scripts/entropy_audit.py` adds offline statistics (Shannon and most-common-value estimates,
monobit, runs, chi-square) over a few KB per source. It is a smoke test, not the SP 800-22 or SP 800-90B
estimator suites, and it is not run on megabytes of data.

## Why a bad quantum source shouldn't weaken output

Every request mixes `os.urandom(64)` into HKDF (A4, A5). Assuming the OS CSPRNG is secure and HKDF/HMAC
behave as modelled, a QRNG that is broken, biased, or controlled by an attacker who does not also control the
server's kernel RNG should not reduce output unpredictability below the OS CSPRNG baseline. This is a
conditional engineering argument, not a mathematical guarantee under a compromised host or implementation
faults. The quantum input adds defence in depth against a weak local RNG, plus provenance. It is
never the sole source of security. If every quantum source is down, requests are served from the OS CSPRNG
and labelled `["os_csprng"]`, `quantum: false`.

## What `entropy_bits` means

`entropy_bits` in a response or receipt is log2 of the size of the output space the secret was sampled from
uniformly (for a password: the character classes and length chosen, accounting for "require each class"). It is
**not** a measurement of qubit min-entropy, and not a certification of output randomness.

## Provenance accounting

- `provenance.sources` lists only sources whose bytes were actually mixed into this request. A provider
  that failed, was rate-limited or was in cooldown is never listed. Public responses mark it `"unavailable"`
  under `failures`, without the raw error.
- `quantum_bytes` counts quantum bytes mixed in: live QRNG bytes, plus pool bytes only if **every** pool
  chunk used came from a `hardware` job. It counts bytes, not min-entropy.
- Simulator output (`IBM_MODE=simulator`, Qiskit Aer) is classical pseudo-randomness. It is labelled
  `ibm_simulator` and never counted as quantum.
- All of this is **operator-asserted**. Receipts sign it, so it can't be altered after issue, but the
  signature does not prove it is true. IBM does not sign job results, so nobody can independently
  authenticate quantum origin today. Receipts carry `evidence.quantum_evidence: "none"`.

## Pool durability

The IBM pool (`backend/app/entropy/pool.py`) is consume-once in memory. To avoid a disk write on every
request, it is persisted at most every 30 s and on shutdown. After a crash, up to 30 s of already-served
pool bytes can be served again. Those bytes are always mixed with fresh `os.urandom`, so outputs stay
independent. The only effect is that two receipts may cite the same IBM job bytes. The pool file is 0600
and lives on the private data volume.

## IBM capacity: the 10-minute question

IBM Quantum's Open Plan gives **10 minutes of QPU time per 28-day window**. One harvest job is a single
layer of Hadamards plus measurement on every qubit:

| Quantity | Value |
|---|---|
| Qubits × shots | 127 × 2,048 (`IBM_SIM_QUBITS` / backend width, `IBM_SHOTS`) |
| Raw output | 260,096 bits = 32,512 bytes |
| After 4:1 conditioning | 8,128 bytes |
| Seeds per job (64 B each) | **127** |
| QPU time per job | A few seconds of usage. Check the actual figure per job in the IBM dashboard |
| Job cap | `IBM_MAX_JOBS_PER_DAY=2` (rolling 24 h). Since V2.1 it is restored from the audit log at startup, so a restart can't reset it |
| Monthly use at the cap | ≈ 56 jobs per 28 days. At ~4 s per job that is ≈ 4 minutes, well inside 10 minutes |

So the free plan supplies about **250 IBM seeds a day**. They go only to signed-in users, with a daily quota
each (`POOL_SEEDS_PER_USER_PER_DAY`, default 20). Everything else uses ANU/LfD (throttled to
`ANU_MIN_INTERVAL_S` / `LFD_MIN_INTERVAL_S`, 16 seeds per upstream call) mixed with the OS CSPRNG.

When the IBM budget or pool runs out, the order is: IBM pool → ANU → LfD → OS CSPRNG only. Each step is
labelled in the response and receipt, and none of them blocks generation.

## Known follow-ups

- Commission an independent cryptographic design review of the mixing, conditioning and receipt scheme before
  a public launch.

- Run SP 800-90B §6 non-IID estimators (e.g. NIST's `SP800-90B_EntropyAssessment`) on ≥ 1,000,000 raw IBM
  samples per backend, and replace A2 with a measured, documented value.
- Raise the conditioning margin (e.g. 5:1 or 6:1) so conditioned IBM bytes can be credited as full entropy
  under §3.1.5.
- `qiskit-ibm-runtime` deprecated `SamplerV2` in 0.50 (removal no sooner than 3 months after that release).
  Migrate `_run_job` in `ibm.py` to the client-side sampler and re-test on hardware.
