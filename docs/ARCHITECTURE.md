# Architecture

```
                 Internet
                    │ 443 (only published port)
              ┌─────▼─────┐
              │   Caddy   │  TLS, HSTS, body limit, JSON access log
              └──┬─────┬──┘
   /api/v2/*,    │     │  everything else
   /quantum-*,   │     │
   /.well-known/ │     │
   quantumpass-  │     │
   keys.json     │     │
          ┌──────▼─┐ ┌─▼────────┐
          │  api   │ │   web    │  Next.js 16 App Router (standalone, non-root, read-only)
          │FastAPI │ │          │  proxy.ts: CSP nonce, no-store, Clerk route protection
          └─┬────┬─┘ └────┬─────┘  server-side reads of non-secret metadata → api (Clerk token, X-Forwarded-For)
            │    │        │
   internal │    └────────┘
   network  │
       ┌────▼─────┐
       │ postgres │  16, private volume, no internet
       └──────────┘
```

## Responsibilities

| Component | Owns | Never does |
|---|---|---|
| **api** (`backend/`) | Entropy (IBM pool, ANU, LfD, OS CSPRNG), health screening, HKDF mixing, generation, receipts and signing keys, draws state machine, audit log, auth verification (Clerk JWT), quotas and cost guardrails, the assistant | Serve web pages |
| **web** (`web/`) | Pages, design system, browser-side receipt verification (`lib/verify`), Clerk UI | Generate, condition or sign anything; receive secrets (Caddy routes API calls straight to the api) |
| **postgres** | Users, usage metadata, receipts (commitments only), draws, idempotency records, audit log | Hold any generated secret |
| **caddy** | TLS and routing | Business logic |

## Request flows

**Generating a secret.** The browser calls `GET /api/v2/password?receipt=true` (`cache: "no-store"`) and Caddy routes
it to the api. The api builds a 64-byte seed: IBM pool bytes (signed-in users, quota), one live QRNG and
`os.urandom(64)`, combined with HKDF-SHA512 into an HMAC-SHA512 keystream. It generates with rejection sampling and
signs a receipt holding `SHA-512(salt ‖ secret)`. The browser receives the secret and salt. They stay in React state.

**Verifying a receipt.** `/verify/{id}` fetches the receipt's raw text and the public key set. `web/lib/verify`
rebuilds the canonical bytes losslessly and verifies Ed25519 and ML-DSA-65 in the browser. Separately, the server's
verdict and draw metadata come from `POST /api/v2/receipts/verify`. The page renders only the browser-verified
payload and flags any disagreement between the two.

**Running a draw.**
1. Commit, in one transaction: the receipt, the draw row, the idempotency record and an audit event.
2. Run: an atomic claim persists the seed (`committed → seeded`); winners are computed deterministically; one
   transaction saves the receipt and marks the draw `done`.
3. A crash between the claim and the finish leaves the draw `needs_investigation` at the next startup. Only an
   admin can complete it, from the persisted seed. See [DRAWS.md](DRAWS.md).

## Data stores

| Table | Contents |
|---|---|
| `users` | Clerk id, email, name, role metadata, last seen |
| `usage_events` | Kind, length, entropy bits, sources, quantum flag, AI cost. No values |
| `receipts` | Canonical payload, signatures, owner. Commitments only |
| `draws` | Title, entries (wiped after completion), fingerprint, status, published seed, provenance, timings |
| `idempotency_keys` | Owner, endpoint, key, request hash, stored response (draw receipts and ids, never secrets) |
| `audit_events` / `audit_head` | Hash-chained events; append-only trigger on PostgreSQL |

Process memory holds the assistant conversations, the IBM pool (persisted to the `api_data` volume) and circuit
breakers. That's why the api runs a single worker; see [RUNBOOK.md](RUNBOOK.md).

## Trust boundaries

1. **Browser ↔ Caddy:** TLS. Pages carry a strict nonce CSP; API responses `default-src 'none'`.
2. **Caddy ↔ api/web:** private Docker network. The api trusts `X-Forwarded-For` only from Caddy and web.
3. **web → api (server-side):** metadata only, with the user's Clerk token. The api re-verifies every token. Nothing
   in web is trusted for authorization.
4. **api → external sources:** QRNG responses are untrusted input. They are health-screened and always mixed with the
   OS CSPRNG, and never trusted alone.
5. **api → postgres:** internal network. The audit log is append-only at the database level.

## Type safety

- **Python:** `mypy --strict` over `backend/app`; strict Pydantic schemas for receipts.
- **TypeScript:** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. Request types are generated
  from the API's OpenAPI document (`npm run gen:api`, with a drift check in CI). Responses are validated with zod at
  the fetch boundary.
- **No Rust in V2.1.** The cryptography already runs on Rust and OpenSSL underneath (`cryptography`, ML-DSA via
  OpenSSL). Candidates for V3: a single-binary offline verifier (CLI and WASM).
