# Quantum Password Generator v2

Passwords and passphrases seeded by **real quantum randomness**: IBM Quantum processors, the ANU vacuum-fluctuation QRNG and the LfD photonic QRNG. Every byte is health-tested, mixed with the OS CSPRNG, and labelled with exactly where its randomness came from.

v1 used Qiskit's `qasm_simulator`, which is a classical pseudo-random generator. v2 replaces it with real quantum sources and shows honest provenance on every result.

## Features

- **Real quantum entropy**, combined from up to three sources:
  - **IBM Quantum.** A background harvester runs Hadamard + measure on every qubit of a real QPU and keeps a consume-once pool of the results. It runs in job mode, so it works on the Open Plan.
  - **ANU QRNG.** Live per request (needs an API key).
  - **LfD QRNG.** Live per request (no key).
- **NIST SP 800-90B continuous health tests.** Repetition-count and adaptive-proportion tests run on every raw quantum byte. A failing source is quarantined, and a circuit breaker stops retrying dead providers.
- **Never trusts a single source.** The 512-bit quantum seed is mixed with `os.urandom` through HKDF-SHA512 and expanded with HMAC-SHA512 in counter mode. A tampered remote QRNG can't weaken output.
- **Unbiased generation.** Rejection sampling means no modulo bias (v1 used `byte % 79`). Entropy is calculated exactly by inclusion–exclusion. Passphrases use the EFF large wordlist.
- **Honest provenance.** Each result reports its sources, `quantum: true/false` and any provider failures. The UI shows "Not quantum" whenever no quantum source contributed.
- **AI assistant (Claude).** Uses tool calls to generate passwords and passphrases, check the entropy sources and estimate crack times. **The model never sees a secret:** tools return a `secret_id` plus metadata, and the value goes straight to the browser.
- **Clerk login and user tracking.** Usage metadata is recorded per user; passwords are never stored. There is an admin dashboard.
- **Local strength checker.** Uses zxcvbn and runs entirely in the browser.
- **Hardened.** Strict CSP, HSTS, `no-store` on every API response, locked CORS and trusted hosts, rate limits, log redaction, a non-root container, and pip-audit / npm audit / bandit in CI.

## Architecture

```
frontend/   React 19 + Vite + Tailwind v4 + Clerk (static build, served by the backend)
backend/    FastAPI
  app/entropy/   providers (anu, lfd, ibm), health tests, pool, mixer, service
  app/generator.py   rejection sampling, passwords, passphrases
  app/assistant/     Claude tool-runner agent
  app/auth.py        Clerk JWT verification      app/db.py   users + usage events (SQLModel)
```

## Quick start (local)

```bash
# backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt -r requirements-ibm.txt qiskit-aer
cp .env.example .env            # fill in what you have; everything is optional locally
uvicorn app.main:app --reload   # http://localhost:8000/api/docs

# frontend (second terminal)
cd frontend
npm install
cp .env.example .env.local      # optional: VITE_CLERK_PUBLISHABLE_KEY
npm run dev                     # http://localhost:5173
```

With no keys at all, the app still runs on LfD (keyless) plus the OS CSPRNG, and it labels results accordingly.

## Connecting IBM Quantum: simulator first, then hardware

1. **Dry run on a local simulator** (no account, no QPU time). This runs the same circuit and pipeline on Qiskit Aer's stabilizer simulator. The output is classical, so the app labels it "IBM simulator (not quantum)".
   ```bash
   IBM_MODE=simulator python -m scripts.ibm_harvest
   ```
2. **Real hardware.** On [quantum.cloud.ibm.com](https://quantum.cloud.ibm.com), create an API key and copy your **Open Plan instance CRN** (Open instances are in `us-east`). Then:
   ```bash
   IBM_MODE=hardware IBM_QUANTUM_TOKEN=<api key> IBM_QUANTUM_INSTANCE=<crn> POOL_PATH=./entropy_pool.bin \
     python -m scripts.ibm_harvest
   ```
   The server loads `POOL_PATH` at startup and tops the pool up in the background. `IBM_MAX_JOBS_PER_DAY` (default 2) caps QPU use. One job uses a few seconds of QPU time, and the Open Plan gives 10 minutes per 28 days.

## Clerk setup

1. Create a Clerk application. Set `VITE_CLERK_PUBLISHABLE_KEY` (frontend) and `CLERK_SECRET_KEY` (backend).
2. **Sessions → Customize session token**: add
   `{"email": "{{user.primary_email_address}}", "name": "{{user.full_name}}", "metadata": "{{user.public_metadata}}"}`
3. Make yourself admin: set public metadata `{"role": "admin"}` on your user.
4. Optional webhook: point `https://<host>/api/v2/webhooks/clerk` at `user.created/updated/deleted` and set `CLERK_WEBHOOK_SECRET`.
5. Add your production Clerk Frontend API host to `CLERK_HOSTS` (used in the CSP).

The generator stays public. The assistant requires sign-in (this caps AI spend), and signed-in users get higher rate limits.

## API

| Endpoint | Description |
|---|---|
| `GET /api/v2/password?length=20&upper&lower&digits&symbols&exclude_ambiguous` | Password + entropy bits + provenance |
| `GET /api/v2/passphrase?words=6&separator=-&capitalize&add_number` | Diceware passphrase |
| `GET /api/v2/random?bytes=32` | Raw random bytes (hex) |
| `GET /api/v2/entropy/status` | Live state of every source, health-test counters, IBM pool |
| `POST /api/v2/assistant/chat` | SSE stream: `conversation`, `text`, `tool`, `secret`, `error`, `done` |
| `GET /api/v2/me`, `GET /api/v2/admin/stats` | User stats / admin dashboard (Clerk) |
| `GET /quantum-password`, `GET /quantum-random` | v1-compatible aliases |

## Testing

```bash
cd backend && pytest                 # 63 tests: generator, health tests, providers, auth, webhooks, assistant, IBM sim
pytest -m live                       # real ANU/LfD calls (network + ANU_API_KEY)
python -m scripts.entropy_audit      # monobit / runs / chi-square / min-entropy per live source
cd frontend && npm test && npm run build
```

## Deploy

```bash
docker build --build-arg VITE_CLERK_PUBLISHABLE_KEY=pk_live_... --build-arg WITH_IBM=true -t qpg .
docker run -p 8000:8000 --env-file backend/.env -v qpg-data:/data --read-only --tmpfs /tmp qpg
```

Run a single worker: the IBM harvester, entropy pool and assistant conversations live in process memory. Put it behind TLS, and set `ENVIRONMENT=production`, `ALLOWED_HOSTS` and `ALLOWED_ORIGINS`.

## Credits

Built by **Mujtaba Hashimi**. Diceware wordlist © Electronic Frontier Foundation, CC BY 3.0 US.
