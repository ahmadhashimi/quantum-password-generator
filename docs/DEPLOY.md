# Deploy checklist (≈ 30 minutes)

Everything below is the exact order to go from this repo to a live, signed-up, quantum-connected service.
Nothing in this file is a secret; your secrets go in `backend/.env`, which is git-ignored.

## 0. What you need

| Item | Where to get it | Needed for |
|---|---|---|
| A Linux VM with Docker (2 vCPU / 2 GB is plenty) and a public IP | Hetzner, DigitalOcean, Fly, AWS Lightsail… | Running the app |
| A domain, with `A`/`AAAA` records → the VM | Your registrar | HTTPS (Caddy issues the certificate automatically) |
| **Clerk** application | clerk.com → Create application | Sign-up / sign-in, MFA, passkeys |
| **IBM Quantum** API key + Open Plan instance CRN | quantum.cloud.ibm.com → API keys; Instances (us-east) | Real quantum hardware |
| **ANU Quantum Numbers** API key (optional) | quantumnumbers.anu.edu.au | Second live quantum source |
| **Anthropic** API key (optional) | console.anthropic.com | AI assistant |

## 1. Clerk setup (10 min)

1. Create the application. Copy the **Publishable key** (`pk_live_…`) and **Secret key** (`sk_live_…`).
2. **User & authentication → Email, Passkeys:** enable passkeys. **Multi-factor:** enable authenticator app + backup codes.
3. **Attack protection:** enable bot protection and disposable-email blocking.
4. **Sessions → Customize session token**, paste exactly:
   ```json
   {"email": "{{user.primary_email_address}}", "name": "{{user.full_name}}", "metadata": "{{user.public_metadata}}"}
   ```
5. **Domains:** add your production domain. Note the **Frontend API** host (looks like `clerk.yourdomain.com`); it goes in `CLERK_HOSTS`.
6. After your first sign-up, open your user in the Clerk dashboard and set **Public metadata** to `{"role": "admin"}`. Enrol MFA on that account — admin routes require a second factor verified within the hour.
7. Optional: **Webhooks → Add endpoint** `https://yourdomain.com/api/v2/webhooks/clerk`, events `user.created`, `user.updated`, `user.deleted`; copy the signing secret.

## 2. Server

```bash
git clone -b v2 https://github.com/ahmadhashimi/quantum-password-generator.git
cd quantum-password-generator
cp backend/.env.example backend/.env
```

Edit `backend/.env` — **only keys**; compose forces every production setting itself:

```ini
CLERK_SECRET_KEY=sk_live_...
CLERK_WEBHOOK_SECRET=whsec_...          # if you set up the webhook
IBM_MODE=hardware
IBM_QUANTUM_TOKEN=...                   # IBM Cloud API key
IBM_QUANTUM_INSTANCE=crn:v1:...         # Open Plan instance CRN
ANU_API_KEY=...                         # optional
ANTHROPIC_API_KEY=...                   # optional; omit to run without the assistant
ASSISTANT_MODEL=claude-opus-5-5         # or claude-haiku-5-5 for ~40x lower assistant cost
```

Then:

```bash
DOMAIN=yourdomain.com VITE_CLERK_PUBLISHABLE_KEY=pk_live_... docker compose up -d --build
docker compose logs -f app        # wait for "Application startup complete"
```

Caddy obtains the TLS certificate on first request. The first IBM harvest runs in the background within a minute;
until the pool has bytes, results use ANU/LfD and are still labelled honestly.

## 3. Verify the deployment (5 min)

```bash
curl -s https://yourdomain.com/api/v2/health
curl -s https://yourdomain.com/api/v2/entropy/status | python -m json.tool     # providers configured/available
curl -s https://yourdomain.com/.well-known/quantumpass-keys.json                # your public signing keys
curl -s "https://yourdomain.com/api/v2/password?length=24&receipt=true"         # provenance should say quantum=true once a source is live
curl -sI https://yourdomain.com/ | grep -iE "strict-transport|content-security|cache-control"
```

- Open the site, **Sign up free**, enrol MFA, set your admin role, open **Admin** — you should see users, usage and AI spend.
- Generate a password: the badge should read **Quantum · …** with the IBM backend and job ID on the verify page.
- Run `python -m scripts.verify_receipt` against a downloaded receipt and your `/.well-known` keys.
- Optional: check TLS at ssllabs.com and confirm hybrid post-quantum key exchange (X25519MLKEM768) is offered.

## 4. Back up the one thing that matters

`/data` (Docker volume `app-data`) holds **`signing_keys.json`**, the entropy pool and the database. If the signing
key is lost, every receipt ever issued becomes unverifiable. Back the volume up, store the key file in a password
manager or secrets vault, and consider moving to a KMS/HSM (roadmap).

```bash
docker run --rm -v quantum-password-generator_app-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/qpg-data-$(date +%F).tgz -C /data .
```

## 5. Key rotation (when needed)

1. Export the current public key set from `/.well-known/quantumpass-keys.json`.
2. Set `RETIRED_SIGNING_KEYS='[{"key_id":"…","ed25519":"…","ml-dsa-65":"…","status":"retired"}]'` (or `"revoked"` with
   `"revoked_at": <unix seconds>` if the key was compromised).
3. Delete `/data/signing_keys.json` (or set `SIGNING_KEYS` to new seeds) and restart. Old receipts stay verifiable;
   receipts issued by a revoked key after its revocation time are rejected.

## 6. Costs to expect

| Item | Typical |
|---|---|
| VM + domain | $5–12 / month |
| IBM Quantum Open Plan | $0 (10 QPU-min per 28 days; `IBM_MAX_JOBS_PER_DAY=2` keeps you inside it) |
| ANU API | per request; batched to 1 call per 16 seeds and interval-throttled |
| Clerk | free up to the free MAU tier |
| AI assistant | bounded by `ASSISTANT_DAILY_BUDGET_USD` / `ASSISTANT_MONTHLY_BUDGET_USD` (defaults $10 / $150) |

Add a spend limit on the Anthropic workspace as an outside backstop.
