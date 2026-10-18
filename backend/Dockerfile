# syntax=docker/dockerfile:1
FROM python:3.13-slim@sha256:70729b46c69b4f1e97c4822c1af3df53a1476cf5ddc6c087c0c10bc3a5678c2f
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app/backend
ARG WITH_IBM=true
COPY backend/requirements.lock backend/requirements-ibm.lock ./
RUN pip install --require-hashes --no-deps -r requirements.lock \
    && if [ "$WITH_IBM" = "true" ]; then pip install --require-hashes --no-deps -r requirements-ibm.lock; fi
COPY backend/app ./app
RUN useradd --system --uid 10001 --home /data app && mkdir -p /data && chown app /data
USER app
ENV ENVIRONMENT=production DATABASE_URL=sqlite:////data/qpg.db \
    POOL_PATH=/data/entropy_pool.bin SIGNING_KEY_PATH=/data/signing_keys.json \
    FRONTEND_DIST=/app/empty
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request as u; u.urlopen(u.Request('http://127.0.0.1:8000/api/v2/health', headers={'Host':'localhost'}))"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
