# syntax=docker/dockerfile:1

FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ARG VITE_CLERK_PUBLISHABLE_KEY=""
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
RUN npm run build

FROM python:3.13-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    ENVIRONMENT=production FRONTEND_DIST=/app/frontend/dist
WORKDIR /app/backend
ARG WITH_IBM=false
COPY backend/requirements.txt backend/requirements-ibm.txt ./
RUN pip install -r requirements.txt && if [ "$WITH_IBM" = "true" ]; then pip install -r requirements-ibm.txt; fi
COPY backend/app ./app
COPY --from=frontend /app/frontend/dist /app/frontend/dist
RUN useradd --system --uid 10001 --home /data app && mkdir -p /data && chown app /data
USER app
ENV DATABASE_URL=sqlite:////data/qpg.db POOL_PATH=/data/entropy_pool.bin
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v2/health')"
# Only trust X-Forwarded-For from the reverse proxy, otherwise clients could spoof their IP to dodge rate limits.
# The default matches the docker-compose network; set FORWARDED_ALLOW_IPS to your proxy's address elsewhere.
ENV FORWARDED_ALLOW_IPS=172.16.0.0/12
# One worker: the IBM harvester, entropy pool and assistant conversations live in process memory.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
