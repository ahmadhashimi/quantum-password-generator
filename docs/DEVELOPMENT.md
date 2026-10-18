# Development

## Prerequisites

Python 3.13, Node 22, optionally PostgreSQL 16 (otherwise SQLite is used) and Docker for image builds.

## Run locally

```bash
# API: http://localhost:8000 (Swagger UI at /api/docs in development)
cd backend
python -m venv .venv && . .venv/bin/activate
pip install --require-hashes --no-deps -r requirements.lock -r requirements-ibm.lock
pip install -r requirements-dev.txt qiskit-aer
cp .env.example .env            # ENVIRONMENT=development: you're signed in as a local admin
uvicorn app.main:app --reload

# Website: http://localhost:3000
cd web
npm ci
cp .env.example .env.local      # API_REWRITE_ORIGIN=http://localhost:8000 proxies /api/v2/* in dev
npm run dev
```

Without Clerk keys the site runs in local mode against the development backend. Add
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` to `web/.env.local`, and `CLERK_SECRET_KEY` to
`backend/.env`, to test real sign-in. Set `IBM_MODE=simulator` to exercise the IBM pipeline locally. Simulator output
is classical and always labelled "not quantum".

## Tests

```bash
cd backend
ruff check . && mypy --strict app
pytest                                                    # SQLite
QPG_TEST_DATABASE_URL=postgresql+psycopg://user@host/db pytest   # PostgreSQL (schema is reset per test)

cd web
npm run typecheck && npm run lint && npm test && npm run build
API_REWRITE_ORIGIN=http://127.0.0.1:8000 npm run build && E2E_PYTHON=../backend/.venv/bin/python npm run test:e2e
```

## Generated files

| File | Regenerate with | Checked in CI |
|---|---|---|
| `web/lib/api/openapi.json` | `cd backend && python -m scripts.export_openapi` | `--check` |
| `web/lib/api/schema.d.ts` | `cd web && npm run gen:api` | `npm run check:api` |
| `web/tests/vectors/receipts.json` | `cd backend && python -m scripts.make_web_vectors` | verified by pytest and vitest |
| `backend/requirements.lock` | `pip-compile --allow-unsafe --generate-hashes --output-file=requirements.lock --strip-extras requirements.txt` | `pip install --require-hashes` |

## Database migrations

PostgreSQL schemas are managed by Alembic (`backend/alembic/`). The API runs `upgrade head` at startup. To change the
schema, edit the models in `backend/app/db.py` and run, against a PostgreSQL database:

```bash
cd backend
DATABASE_URL=postgresql+psycopg://… alembic revision --autogenerate -m "describe the change"
DATABASE_URL=postgresql+psycopg://… alembic upgrade head && alembic check
```

Review the generated migration by hand. Migrations are forward-only in production.

## Conventions

- Backend: ruff (line length 120), mypy strict, terse docstrings that explain why. Never log secrets.
- Web: Server Components by default; Client Components only for interaction. Design tokens and `components/ui`
  only ([DESIGN.md](DESIGN.md)). Secrets only via `lib/api/client.ts` and kept in React state.
- Commits: one logical change each; tests with the change.
