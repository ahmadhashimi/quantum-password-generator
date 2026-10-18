import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import httpx
from anthropic import AsyncAnthropic
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.concurrency import run_in_threadpool
from starlette.middleware.trustedhost import TrustedHostMiddleware

from . import db
from .api import admin as admin_api
from .api import assistant as assistant_api
from .api import receipts as receipts_api
from .api import routes, webhooks
from .assistant.agent import Assistant, Limits
from .config import Settings, get_settings
from .entropy import EntropyService
from .logging_setup import RequestContextMiddleware, configure_logging
from .ratelimit import limiter
from .receipts import Keyring, Signer
from .security import BodySizeLimitMiddleware, SecurityHeadersMiddleware

log = logging.getLogger(__name__)


async def _audit_event(action: str, target: str | None, details: dict[str, Any]) -> None:
    await run_in_threadpool(db.audit, "system", action, target, details)


def _audit_key_state(keyring: Keyring) -> None:
    """Record which keys this process serves; a changed active key is recorded as a rotation."""
    active = keyring.active.public_keys()["key_id"]
    others = [k for k in keyring.public() if k["key_id"] != active]
    previous = db.last_audit("key.loaded")
    if previous and previous["target"] != active:
        db.audit("system", "key.rotated", active, {"previous": previous["target"]})
    db.audit("system", "key.loaded", active, {
        "retired": sorted(k["key_id"] for k in others if k["status"] == "retired"),
        "revoked": sorted(k["key_id"] for k in others if k["status"] == "revoked")})


def create_app(settings: Settings | None = None, entropy: EntropyService | None = None,
               assistant: Assistant | None = None, signer: Signer | None = None) -> FastAPI:
    s = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        db.init_db()
        db.purge_anonymous_receipts()
        db.purge_idempotency()
        # Single-instance service: any draw still `seeded` at startup was interrupted mid-run. Never re-run it.
        for draw_id in db.mark_stuck_draws(older_than_s=0):
            log.warning("draw %s interrupted after seeding; needs investigation", draw_id)
        client = httpx.AsyncClient(headers={"user-agent": "quantum-password-generator/2"})
        app.state.entropy = entropy or EntropyService.from_settings(s, client)
        app.state.keyring = (Keyring(signer) if signer else
                             Keyring.from_settings(s.signing_key_path, s.signing_keys, s.retired_signing_keys))
        app.state.signer = app.state.keyring.active
        _audit_key_state(app.state.keyring)
        app.state.entropy.on_event = _audit_event
        if harvester := app.state.entropy.harvester:
            harvester.on_event = _audit_event
            harvester.restore_job_times(db.audit_times("provider.ibm_job_submitted", harvester.name, 86_400))
            harvester.start()
        app.state.assistant = assistant or (
            Assistant(AsyncAnthropic(api_key=s.anthropic_api_key), s.assistant_model, app.state.entropy,
                      Limits(s.assistant_daily_messages_per_user, s.assistant_user_daily_budget_usd,
                             s.assistant_daily_budget_usd, s.assistant_monthly_budget_usd,
                             s.assistant_max_tokens, s.assistant_max_tool_iterations))
            if s.assistant_enabled else None)
        yield
        if harvester:
            await harvester.stop()
        await client.aclose()

    docs = s.environment == "development"
    app = FastAPI(title="Quantum Password Generator", version=routes.VERSION, lifespan=lifespan,
                  docs_url="/api/docs" if docs else None, redoc_url=None,
                  openapi_url="/api/openapi.json" if docs else None)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

    app.include_router(routes.router)
    app.include_router(assistant_api.router)
    app.include_router(webhooks.router)
    app.include_router(receipts_api.router)
    app.include_router(admin_api.router)

    app.add_middleware(SlowAPIMiddleware)
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=1_000_000)
    app.add_middleware(CORSMiddleware, allow_origins=s.allowed_origins, allow_credentials=True,
                       allow_methods=["GET", "POST", "DELETE"],
                       allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Request-ID"],
                       expose_headers=["X-Request-ID", "Idempotent-Replayed"])
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=s.allowed_hosts)
    app.add_middleware(SecurityHeadersMiddleware, settings=s)
    app.add_middleware(RequestContextMiddleware)  # outermost: every response and log line gets a request id
    return app


_settings = get_settings()
configure_logging(_settings.log_format or ("text" if _settings.environment == "development" else "json"),
                  _settings.log_level)
app = create_app(_settings)
