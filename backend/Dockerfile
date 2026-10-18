# syntax=docker/dockerfile:1
# FastAPI image: API only (the website is the separate web/ image). Build context: backend/
FROM python:3.13-slim@sha256:70729b46c69b4f1e97c4822c1af3df53a1476cf5ddc6c087c0c10bc3a5678c2f AS deps
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
ARG WITH_IBM=true
COPY requirements.lock requirements-ibm.lock /tmp/
# Hash-pinned locks: a tampered or typosquatted package fails the install instead of shipping.
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --require-hashes --no-deps -r /tmp/requirements.lock \
    && if [ "$WITH_IBM" = "true" ]; then /opt/venv/bin/pip install --require-hashes --no-deps -r /tmp/requirements-ibm.lock; fi

FROM python:3.13-slim@sha256:70729b46c69b4f1e97c4822c1af3df53a1476cf5ddc6c087c0c10bc3a5678c2f AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PATH=/opt/venv/bin:$PATH \
    ENVIRONMENT=production LOG_FORMAT=json \
    DATABASE_URL=sqlite:////data/qpg.db POOL_PATH=/data/entropy_pool.bin SIGNING_KEY_PATH=/data/signing_keys.json
WORKDIR /app
COPY --from=deps /opt/venv /opt/venv
COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app
COPY scripts ./scripts
RUN useradd --system --uid 10001 --home /data app && mkdir -p /data && chown app /data
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s \
    CMD python -c "import urllib.request as u; u.urlopen(u.Request('http://127.0.0.1:8000/api/v2/health', headers={'Host': 'localhost'}))"
# Migrations run at startup (single instance). X-Forwarded-For is trusted only from FORWARDED_ALLOW_IPS (compose sets
# Caddy's and the web container's fixed addresses); never widen it to a whole range or clients can spoof IPs.
# One worker: the IBM harvester, entropy pool and assistant conversations live in process memory. uvicorn's own access
# log is off: the app logs requests by route template, without paths or query strings.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--no-access-log"]
