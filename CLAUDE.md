# QuantumPass — working notes for Claude Code

Quantum-assisted secret issuance with post-quantum signed, independently verifiable evidence.
`backend/` = FastAPI (entropy, generation, receipts, draws, audit log, auth). `web/` = Next.js 16 App Router site.
Deployed as separate containers behind Caddy with PostgreSQL ([docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)).

## Commands

```bash
# backend (venv with requirements.lock + requirements-dev.txt)
cd backend && ruff check . && mypy --strict app && pytest
QPG_TEST_DATABASE_URL=postgresql+psycopg://… pytest       # same suite on PostgreSQL
python -m scripts.export_openapi                          # after API changes, then: cd web && npm run gen:api
python -m scripts.make_web_vectors                        # after receipt format changes
# web
cd web && npm run typecheck && npm run lint && npm test && npm run build
```

Full setup: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Operations: [docs/RUNBOOK.md](docs/RUNBOOK.md).

## Invariants that must never break

1. **Secrets never persist or leave the request.** No secret, salt or pre-run draw seed in logs, the database,
   analytics, URLs, caches, server-rendered HTML or RSC payloads. Receipts store `SHA-512(salt ‖ secret)` only.
   `tests/test_logging.py` scans logs and every table.
2. **Generation, conditioning and signing live only in the backend.** The web tier never generates or signs.
3. **Quantum input is never trusted alone.** Every request mixes `os.urandom` through HKDF. A source that fails
   screening contributes nothing, and an unavailable source is never reported as contributing.
4. **Honest labels.** Integrity (signatures) ≠ provenance (operator-asserted) ≠ quantum evidence (none today).
   Simulator output is "not quantum". Never claim certified, NIST/FIPS/GLI compliance, "unhackable" or "proves
   origin". Health tests are "SP 800-90B-style screening".
5. **Draws run at most once.** Never draw fresh randomness for a draw that left `committed`. Interrupted draws go
   to `needs_investigation` and are completed only from the persisted seed.
6. **Receipts are verified from exact bytes.** Canonical JSON keeps Python number formatting (`128.0`); the browser
   uses the lossless parser in `web/lib/verify`. Changing the receipt format needs a new version, regenerated
   vectors, and the Python and TypeScript verifiers updated together.
7. **API responses are `no-store`.** Sensitive pages are `no-store`, and links to them use `prefetch={false}`.
8. **The audit log is append-only and hash-chained.** Never rewrite hashes to "repair" it.
9. **Cost guardrails stay on:** assistant budget caps and the IBM daily job cap (restored from the audit log at
   startup).

## Conventions

- Assistant model: Sonnet 5.5 (`claude-sonnet-5-5`) by default; Haiku requests must omit server-side fallback.
- Python: ruff (120 columns), mypy strict, docstrings that say why. TypeScript: strict +
  `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`; zod at fetch boundaries; design tokens only
  ([docs/DESIGN.md](docs/DESIGN.md)).
- Never ask anyone to paste API keys into a chat. Keys go in `backend/.env`, `web/.env.local` or `deploy/.env`
  (git-ignored).
- `private/` holds pre-filing invention notes and must never be committed or published.
- Work on a feature branch; no automatic merges or deploys.
