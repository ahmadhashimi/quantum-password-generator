# Next.js V2.1 preview — not production enabled

This directory stages the App Router migration without replacing `frontend/` or changing the production Compose deployment.

- `package-lock.json` is committed from a successful GitHub Actions install; use `npm ci` for reproducible builds.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` for browser sign-in, `CLERK_SECRET_KEY` for authenticated server routes.
- `API_INTERNAL_ORIGIN=http://localhost:8000` for development rewrites.
- Run `npm run typecheck && npm run build`, then browser E2E security tests.
- Security-sensitive API calls originate in client components and use `cache: "no-store"`; generated values never appear in React Server Component props.
- The isolated `docker-compose.next-preview.yml` and separate Dockerfiles are staged for testing; PostgreSQL migrations, browser-side signature verification, CSP hardening, billing and complete feature parity are **still pending**.
- Do not deploy this preview until those gates and an independent security review pass.

**Local preview:** set `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in your shell, create `backend/.env`, and run `DOMAIN=your-test-domain docker compose -f docker-compose.next-preview.yml up --build` from the repository root. This is a preview, not a production launch procedure.
