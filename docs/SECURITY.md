# Security

This document describes the threat model, the controls in place, what an independent adversarial review found
(and what was done about it), and the limits we are honest about. Report issues via
[GitHub security advisories](https://github.com/ahmadhashimi/quantum-password-generator/security/advisories/new).

## What we protect

| Asset | Goal |
|---|---|
| Generated secrets (passwords, passphrases, bytes) | Never stored, logged, cached or shown to the AI model. Delivered once, over TLS, with `Cache-Control: no-store`. |
| Receipt signing keys | Owner-only key file (0600, atomically created) or secret env var; public keys published; rotation and revocation supported. |
| Draw integrity | Entries are committed and signed **before** any randomness exists; each draw runs exactly once; all draws over the same entry list are counted publicly. |
| Quantum entropy supply | Screened using SP 800-90B-inspired RCT/APT tests (not validated or certified), rate-limited, quota-protected, and never trusted alone (always mixed with the OS CSPRNG). |
| Users' accounts | Clerk session JWTs verified server-side (signature, expiry, authorized party). Admin requires a recently verified second factor. |
| Money | Hard USD caps on AI spend (per user, per day, per month) that are reserved **before** a model call and settled even if the client disconnects. |

## Threat model, in one table

| Attacker | What they try | What stops them |
|---|---|---|
| Internet, anonymous | Flood endpoints, drain the quantum pool, burn paid QRNG quota | Global per-IP limit before any work; body size limit; per-route limits; IBM pool is for signed-in users with a daily quota; upstream QRNG calls are batched (1 call ≈ 16 requests) and interval-throttled; auth/quota refusals open the breaker for an hour |
| Internet, anonymous | Spoof `X-Forwarded-For` to dodge limits | Only the reverse proxy's fixed address is trusted; IPv6 clients are bucketed per /64 |
| Free account holder | Overspend the AI assistant via concurrency, disconnects or failed calls | Atomic admit-and-reserve, one stream per user, worst-case cost kept on failure, shielded settlement, token and tool-loop caps, ≤ 3 secrets per message, no parallel tool calls |
| Draw organiser | Re-roll until a favourite wins and publish only that result | Commit-then-run with an atomic once-only run; canonical (sorted, de-duplicated, NFC) entry fingerprint so shuffles are detected; public count of all draws over the same list; commit-to-run delay shown to verifiers; 50 draws/user/day |
| Forger | Fake or alter a receipt | Canonical JSON signed with **Ed25519 + ML-DSA-65**, domain-separated so neither signature can be reused alone; verification requires both; unknown and revoked keys are rejected |
| Malicious web page | DNS-rebind to a local dev server, clickjack, XSS | Host allowlist (localhost by default), strict CSP, `frame-ancestors 'none'`, React escaping, organiser text shown in a clearly labelled "not checked by us" box, links blocked in draw titles |
| Supply chain | Tampered dependency or base image | Hash-pinned lock files installed with `--require-hashes --no-deps`, images pinned by digest, GitHub Actions pinned by commit SHA, pip-audit / npm audit / bandit in CI |
| Operator mistake | Deploy with unsafe defaults | Production is the default; dev auto-admin requires an explicit opt-in; compose forces production paths and settings regardless of `.env` |

## Independent review

An adversarial audit (6 specialist reviewers, every finding challenged by 2 independent verifiers, 85 agents in
total) was run against the `v2` branch. Findings and status:

| Severity | Finding | Status |
|---|---|---|
| Critical | Client disconnect skipped AI usage recording, bypassing all spend caps | **Fixed** — cost reserved before the call, settled in a cancellation-shielded block |
| High | Concurrent requests passed budget checks before usage was recorded | **Fixed** — atomic admission, one stream per user |
| High | Draws could be re-rolled until a chosen entry won | **Fixed** — commit-then-run, once-only execution, public sibling count, canonical fingerprint |
| High | Missing `ENVIRONMENT` + missing Clerk key made every visitor an admin | **Fixed** — production is the default |
| High | Every request made a live ANU/LfD call (quota burn, flooding a free service) | **Fixed** — batched buffers, per-provider intervals, long back-off on 401/403/429 |
| High | Signing key path not on the persistent volume; `.env` could override container paths | **Fixed** — compose pins paths, key file on `/data` |
| High | Anonymous draws could write multi-MB receipts without limit | **Fixed** — sign-in required, 100 winners / 256 KB caps, retention for anonymous receipts |
| Medium | Trusted-proxy range too wide; IPv6 limits per address | **Fixed** |
| Medium | Health check always failed under the Host allowlist | **Fixed** |
| Medium | Receipt named the *latest* IBM job rather than the jobs whose bytes were used | **Fixed** — per-chunk job provenance |
| Medium | No key rotation; malformed receipts returned 500 | **Fixed** — keyring with retired/revoked keys, strict parsing |
| Medium | Unpinned dependencies and images | **Fixed** — hashed locks, digest and SHA pins |
| Low | Admin role honoured without MFA; deleted users revived; tombstones | **Fixed** |
| Low | SPA crash on malformed verify links; clipboard wipe silently failing | **Fixed** |

Items still open, by choice or pending: inline refill on a cold buffer (now 1 upstream call per 16 requests, but
still request-driven); receipts served from the database rather than an LRU cache; no HSM/KMS for the signing key
yet.

## Cryptography

- **Entropy:** `seed = HKDF-SHA512(quantum_bytes ‖ os.urandom(64))`, expanded with HMAC-SHA512 in counter mode.
  Assuming a secure OS CSPRNG and correct HKDF/HMAC implementation, untrusted external input should not reduce the OS security baseline. This is not a guarantee against compromised hosts or implementation flaws.
- **Sampling:** rejection sampling (no modulo bias); exact entropy via inclusion–exclusion.
- **Receipts:** canonical JSON (sorted keys, no whitespace) → `SIGNING_DOMAIN ‖ json` → Ed25519 **and** ML-DSA-65
  (FIPS 204, lattice-based). Both must verify. `key_id = SHA-256(ed25519_pk ‖ mldsa_pk)[:16]`.
- **Secret commitments:** `SHA-512(salt32 ‖ secret)`; the salt goes only to the requester.
- **Transport:** Caddy with automatic TLS. Hybrid post-quantum key exchange (X25519 + ML-KEM) is expected from the
  pinned Caddy/Go toolchain by default; confirm on your deployment with a TLS scanner.

## Limits we state plainly

- A quantum entropy source does **not** make a password stronger than a correctly used OS CSPRNG. What it adds is
  **server-signed provenance statements you can inspect**. We never claim "unhackable" or "quantum-safe passwords".
- The receipt proves *what this server committed to and signed*, including the IBM job it says it used. It does
  **not** prove quantum origin against a dishonest operator: IBM does not sign job results, and third parties
  cannot fetch someone else's job. This is not device-independent or "certified" randomness.
- The post-quantum signature protects the receipt's integrity against future quantum computers. Password
  strength itself is a matter of length: use 256-bit secrets (≈ 40 characters, or ≈ 20 words) if you want margin
  against Grover-style search.
- Single-instance design: rate limits, the entropy pool and chat sessions live in process memory.
