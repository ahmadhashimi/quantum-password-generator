# syntax=docker/dockerfile:1

FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ARG VITE_CLERK_PUBLISHABLE_KEY=""
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
RUN npm run build

FROM python:3.13-slim@sha256:70729b46c69b4f1e97c4822c1af3df53a1476cf5ddc6c087c0c10bc3a5678c2f AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    ENVIRONMENT=production FRONTEND_DIST=/app/frontend/dist
WORKDIR /app/backend
ARG WITH_IBM=false
COPY backend/requirements.lock backend/requirements-ibm.lock ./
# Hash-pinned locks: a tampered or typosquatted package fails the install instead of shipping.
RUN pip install --require-hashes --no-deps -r requirements.lock \
    && if [ "$WITH_IBM" = "true" ]; then pip install --require-hashes --no-deps -r requirements-ibm.lock; fi
COPY backend/app ./app
COPY --from=frontend /app/frontend/dist /app/frontend/dist
RUN useradd --system --uid 10001 --home /data app && mkdir -p /data && chown app /data
USER app
ENV DATABASE_URL=sqlite:////data/qpg.db POOL_PATH=/data/entropy_pool.bin SIGNING_KEY_PATH=/data/signing_keys.json
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request as u; u.urlopen(u.Request('http://127.0.0.1:8000/api/v2/health', headers={'Host': 'localhost'}))"
# X-Forwarded-For is trusted only from FORWARDED_ALLOW_IPS (uvicorn default: 127.0.0.1). docker-compose sets it to
# Caddy's fixed address; never widen it to a whole Docker range or clients can spoof IPs to dodge rate limits.
# One worker: the IBM harvester, entropy pool and assistant conversations live in process memory.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
