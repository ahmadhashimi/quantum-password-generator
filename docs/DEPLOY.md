# Deploy checklist (about 30 minutes)

From this repository to a live service: Caddy (TLS) in front of the Next.js site and the FastAPI API, with
PostgreSQL. Nothing in this file is a secret; your secrets go in `deploy/.env`, which is git-ignored.
Operations after launch (backups, restores, rollback, key compromise) are in [RUNBOOK.md](RUNBOOK.md).

## 0. What you need

| Item | Where to get it | Needed for |
|---|---|---|
| A Linux VM with Docker Compose (2 vCPU / 4 GB) and a public IP | Hetzner, DigitalOcean, AWS Lightsail… | Running the stack |
| A domain with `A`/`AAAA` records pointing at the VM | Your registrar | HTTPS (Caddy issues the certificate automatically) |
| **Clerk** application | clerk.com → Create application | Sign-up / sign-in, MFA, passkeys |
| **IBM Quantum** API key + Open Plan instance CRN | quantum.cloud.ibm.com → API keys; Instances (us-east) | Real quantum hardware |
| **ANU Quantum Numbers** API key (optional) | quantumnumbers.anu.edu.au | Second live quantum source |
| **Anthropic** API key (optional) | console.anthropic.com | AI assistant (Sonnet 5.5 by default) |

## 1. Clerk setup (10 min)

1. Create the application. Copy the **Publishable key** (`pk_live_…`) and **Secret key** (`sk_live_…`).
2. **User & authentication:** enable passkeys. **Multi-factor:** enable authenticator app and backup codes.
3. **Attack protection:** enable bot protection and disposable-email blocking.
4. **Sessions → Customize session token**, paste exactly:
   ```json
   {"email": "{{user.primary_email_address}}", "name": "{{user.full_name}}", "metadata": "{{user.public_metadata}}"}
   ```
5. **Domains:** add your production domain. The site's CSP picks up the Clerk Frontend API host from the
   publishable key automatically.
6. After your first sign-up, set your user's **Public metadata** to `{"role": "admin"}` and enrol MFA. Admin routes
   require a second factor verified within the hour.
7. Optional: **Webhooks → Add endpoint** `https://yourdomain.com/api/v2/webhooks/clerk` with events `user.created`,
   `user.updated` and `user.deleted`. Copy the signing secret.

## 2. Server

```bash
git clone https://github.com/ahmadhashimi/quantum-password-generator.git
cd quantum-password-generator
cp deploy/.env.example deploy/.env && chmod 600 deploy/.env
```

Fill in `deploy/.env`: `DOMAIN`, a long URL-safe `POSTGRES_PASSWORD`, the Clerk keys, IBM/ANU keys and optionally
`ANTHROPIC_API_KEY`. Compose forces every production setting itself (environment, hosts, origins, database URL,
trusted proxies). Then:

```bash
docker compose --env-file deploy/.env up -d --build
docker compose --env-file deploy/.env logs -f api      # wait for "Application startup complete"
```

At startup the API applies database migrations, creates the signing key in the private `api_data` volume (0600) and
records `key.loaded` in the audit log. Caddy obtains the TLS certificate on the first request. The first IBM harvest
runs in the background; until the pool has bytes, results use ANU/LfD (or the OS CSPRNG) and say so.

## 3. Verify the deployment (5 min)

```bash
deploy/smoke.sh https://yourdomain.com
```

It checks API and web health, the key set, security headers (CSP nonce, HSTS, no-store), a receipt round trip and
the status page. Then, by hand:

- Sign up, enrol MFA, set the admin role, open **/admin**: stats, the audit log (run **Verify hash chain**) and
  providers.
- Generate a password with a receipt and open it in the Proof Explorer. Both signatures should verify **in your
  browser** and on the server, and the IBM backend and job id should appear under operator-asserted provenance.
- Download the evidence and run the standalone verifier: `python verify_receipt.py evidence.json keys.json`.

## 4. Back up from day one

```bash
QPG_BACKUP_PASSPHRASE='…stored apart from the backups…' deploy/backup.sh ./backups
```

Run it daily (cron or a systemd timer). Copy `./backups` off the host, and run `deploy/restore-test.sh` on a copy
monthly; see [RUNBOOK.md](RUNBOOK.md#backups). If the signing key is lost, receipts can't be re-issued under it.
If it leaks, follow the emergency procedure there.

## 5. Costs to expect

| Item | Typical |
|---|---|
| VM + domain | $10–20 / month |
| IBM Quantum Open Plan | $0 (10 QPU-minutes per 28 days; `IBM_MAX_JOBS_PER_DAY=2` keeps you inside it, enforced across restarts) |
| ANU API | per request; batched to one call per 16 seeds and interval-throttled |
| Clerk | free up to the free MAU tier |
| AI assistant | bounded by `ASSISTANT_DAILY_BUDGET_USD` / `ASSISTANT_MONTHLY_BUDGET_USD` (defaults $10 / $150) |

Add a spend limit on the Anthropic workspace as an outside backstop.
