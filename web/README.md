# Next.js V2.1 preview — not production enabled

This directory stages the App Router migration without replacing `frontend/` or changing the production Compose deployment.

- `npm install` and commit a verified `package-lock.json` before merging.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` for browser sign-in, `CLERK_SECRET_KEY` for authenticated server routes.
- `API_INTERNAL_ORIGIN=http://localhost:8000` for development rewrites.
- Run `npm run typecheck && npm run build`, then browser E2E security tests.
- Security-sensitive API calls originate in client components and use `cache: "no-store"`; generated values never appear in React Server Component props.
- Caddy, separate Docker images, PostgreSQL migrations, browser signature verification, CSP hardening and complete parity are **still pending**.
- Do not deploy this preview until those gates and an independent security review pass.
