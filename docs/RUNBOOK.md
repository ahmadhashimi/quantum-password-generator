# Operations runbook

The procedures for running QuantumPass in production: backups and restores, rollbacks, signing keys
(including emergency compromise), draw recovery, logs and the audit log. Deployment itself is in
[DEPLOY.md](DEPLOY.md).

## Topology

| Service | Image | Network | Persistent data |
|---|---|---|---|
| `caddy` | `caddy` (pinned digest) | public :80/:443, internal | `caddy_data` (TLS certificates) |
| `web` | `web/Dockerfile` (Next.js standalone, non-root) | internal only | none |
| `api` | `backend/Dockerfile` (FastAPI, non-root, read-only root fs) | internal only | `api_data`: signing key (0600), IBM pool |
| `postgres` | `postgres:16` (pinned digest) | internal only | `pg_data` |

Caddy routes `/api/v2/*`, `/quantum-*` and `/.well-known/quantumpass-keys.json` to `api:8000`, and
everything else to `web:3000`. Only Caddy publishes ports.

Secrets live in `deploy/.env` (mode 0600, never committed): `POSTGRES_PASSWORD`, `CLERK_*`,
`ANTHROPIC_API_KEY`, `ANU_API_KEY`, `IBM_QUANTUM_TOKEN`, `IBM_QUANTUM_INSTANCE`, optional `SIGNING_KEYS`,
`RETIRED_SIGNING_KEYS`.

## Health and smoke tests

- `GET /api/v2/health` (api), `GET /` (web). Compose healthchecks restart unhealthy containers.
- `deploy/smoke.sh https://your.domain` after every deploy: health, keys endpoint, a password with a
  receipt that verifies, security headers, `no-store` on API responses, the status page.

## Logs

- The API writes **JSON lines** to stderr (`LOG_FORMAT=json`, the default outside development):
  `ts`, `level`, `logger`, `request_id`, `msg`, plus `http` (method, route template, status, duration) on
  access lines.
- Every response carries `X-Request-ID`. Quote it in bug reports, then search the logs for it:
  `docker compose logs api | grep '"request_id": "<id>"'`.
- **Never logged**: secrets, salts, seeds, tokens, query strings, raw paths (only route templates such as
  `/api/v2/receipts/{receipt_id}`), raw provider errors in public responses. Redaction in the log formatter
  is a backstop, and `tests/test_logging.py` scans logs and every database table for generated secrets.
- If a secret ever shows up in a log: rotate whatever leaked, purge the affected log storage, record an
  `incident` note in the tracker, and add a regression test.

## Audit log

An append-only, hash-chained table (`audit_events`). On PostgreSQL a trigger rejects `UPDATE` and `DELETE`.
Recorded actions:

| Action | When |
|---|---|
| `draw.commit`, `draw.seeded`, `draw.run` | the draw lifecycle (inside the same transactions) |
| `draw.needs_investigation`, `draw.admin_complete` | recovery |
| `key.loaded`, `key.rotated` | every startup; a changed active key is recorded as a rotation |
| `provider.breaker_open`, `provider.health_failed` | entropy provider trouble (coarse cause only) |
| `provider.ibm_job_submitted`, `provider.ibm_harvest` | QPU usage (also restores the daily job cap after restarts) |
| `budget.kill_switch` | assistant daily or monthly cap reached (throttled) |
| `admin.denied` | non-admin, or admin without recent MFA, on an admin endpoint (throttled per user) |
| `user.deleted` | Clerk webhook |

- View: `GET /api/v2/admin/audit?after=<seq>` or the `/admin` page.
- Verify: `GET /api/v2/admin/audit/verify` returns `{"ok", "events", "first_bad_seq", "head"}`. The
  restore test runs it on every restored backup.
- If `ok` is false: treat it as an incident. Take a database snapshot first, then compare against the
  latest backup to find which rows changed. Never "repair" the chain by rewriting hashes.

## Backups

`deploy/backup.sh` (run daily from cron or a systemd timer on the host) writes to `BACKUP_DIR`:

1. `qpg-<timestamp>.dump`: `pg_dump --format=custom` of the database.
2. `signing-key-<key_id>.qpgkey`: the signing key, encrypted with scrypt + AES-256-GCM
   (`python -m scripts.keys backup`). The passphrase comes from `QPG_BACKUP_PASSPHRASE` and is stored
   **separately** from the backups (a password manager or a sealed envelope).
3. `MANIFEST.sha256`: checksums of both files.

Copy backups off the host (object storage with versioning and object lock, or another machine). Keep 14
daily and 12 monthly copies. The IBM pool file is not backed up; it refills from new jobs.

## Restore test (required before release, then monthly)

`deploy/restore-test.sh <dump> [key backup]`:

1. creates a scratch database and restores the dump into it;
2. checks that `alembic current` equals the code's head revision;
3. verifies the audit-log hash chain;
4. re-verifies a sample of stored receipts against the restored keys (needs the keys from the backup);
5. compares row counts with the source and prints a report.

It exits non-zero on any failure. Keep the output of the last run with the release notes.

## Full restore (disaster recovery)

1. Provision the host and check out the release tag that matches the backup (see the dump's
   `alembic_version`).
2. `docker compose up -d postgres`, then
   `docker compose exec -T postgres pg_restore -U qpg -d qpg --clean --if-exists < qpg-<ts>.dump`.
3. Restore the signing key:
   `docker compose run --rm api python -m scripts.keys restore --in /backups/signing-key-<id>.qpgkey --key-file /data/signing_key.json`.
4. `docker compose up -d`. At startup the API checks migrations, flags interrupted draws and records
   `key.loaded`.
5. Run `deploy/smoke.sh`, then confirm `/api/v2/admin/audit/verify` returns `ok`.

## Rollback

- Images are tagged with the git commit SHA. To roll back the web tier only, set `WEB_IMAGE` to the
  previous tag and run `docker compose up -d web`. It holds no state.
- API: roll back to the previous image **only if no migration ran in between** (`alembic current` matches
  the previous release's head). Migrations are forward-only in production. If a migration must be undone,
  restore the pre-deploy backup instead of running `alembic downgrade` against live data.
- Take a backup before every deploy that includes a migration.

## Signing keys

The signing key is the root of every receipt's integrity. Its public half is served at
`/.well-known/quantumpass-keys.json`.

**Routine rotation** (yearly, or when an operator with access leaves):

```bash
python -m scripts.keys backup --key-file data/signing_key.json --out old-key.qpgkey   # keep offline
python -m scripts.keys rotate --key-file data/signing_key.json                        # prints RETIRED_SIGNING_KEYS
# set RETIRED_SIGNING_KEYS to the printed JSON in deploy/.env, restart the api
```

Old receipts keep verifying, with status `retired`. The restart records `key.rotated` in the audit log.
Move or destroy the `.retired` private key file that `rotate` leaves next to the key.

### Emergency: suspected key compromise

1. **Rotate immediately** (as above) so new receipts use a fresh key.
2. **Revoke** the old key from the earliest time it may have been exposed:
   `python -m scripts.keys revoke --key-id <old> --at <unix time of suspected exposure> --retired retired.json`,
   then set `RETIRED_SIGNING_KEYS` and restart. Receipts that key signed at or after `revoked_at` now
   verify as **invalid** (`reason: revoked_key`), both server-side and in offline verifiers that use the
   published key set.
3. Publish a notice on `/transparency` with the key ID, the `revoked_at` time and the reason. Tell draw
   owners whose receipts fall after `revoked_at`.
4. Investigate how the key leaked (host access, backups, env). Rotate every other secret on the same host.
5. Receipts issued **before** `revoked_at` stay valid. Pick `revoked_at` conservatively.

## Interrupted draws

See [DRAWS.md § Recovery rules](DRAWS.md#recovery-rules). In short: never re-run, investigate, then
complete from the persisted seed with `POST /api/v2/admin/draws/{id}/complete`.

## Cost incidents

- **Assistant spend**: caps are `ASSISTANT_DAILY_BUDGET_USD`, `ASSISTANT_MONTHLY_BUDGET_USD` and the
  per-user limits. When a cap is hit, the assistant stops answering, generation is unaffected, and
  `budget.kill_switch` is recorded. To stop all model calls at once, set `ASSISTANT_ENABLED=false` and
  restart.
- **IBM QPU time**: at most `IBM_MAX_JOBS_PER_DAY` jobs per rolling 24 h, enforced across restarts from the
  audit log. Check usage in the IBM dashboard against the 10-minute / 28-day Open Plan allowance. To stop
  QPU use, unset `IBM_QUANTUM_TOKEN` and restart. Service continues on ANU/LfD + OS CSPRNG, labelled.

## Provider outages

ANU, LfD or IBM failures open a circuit breaker (`provider.breaker_open`). Auth or quota refusals back off
for an hour. Output then comes from the remaining sources, or from the OS CSPRNG alone, and receipts and the
status page say so. No action is needed unless a provider stays down. Check `/status` and the admin page
for `state` and `last_success_at`.
