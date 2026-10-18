import logging
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from anthropic import AsyncAnthropic
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from . import db
from .api import assistant as assistant_api
from .api import receipts as receipts_api
from .api import routes, webhooks
from .assistant.agent import Assistant, Limits
from .config import Settings, get_settings
from .entropy import EntropyService
from .ratelimit import limiter
from .receipts import Keyring, Signer
from .security import BodySizeLimitMiddleware, SecurityHeadersMiddleware, install_log_redaction


def create_app(settings: Settings | None = None, entropy: EntropyService | None = None,
               assistant: Assistant | None = None, signer: Signer | None = None) -> FastAPI:
    s = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        install_log_redaction()
        db.init_db()
        recovered = db.mark_interrupted_draws()
        if recovered:
            logging.getLogger(__name__).warning("%d interrupted draws require manual investigation", recovered)
        db.purge_anonymous_receipts()
        client = httpx.AsyncClient(headers={"user-agent": "quantum-password-generator/2"})
        app.state.entropy = entropy or EntropyService.from_settings(s, client)
        app.state.keyring = (Keyring(signer) if signer else
                             Keyring.from_settings(s.signing_key_path, s.signing_keys, s.retired_signing_keys))
        app.state.signer = app.state.keyring.active
        if app.state.entropy.harvester:
            app.state.entropy.harvester.start()
        app.state.assistant = assistant or (
            Assistant(AsyncAnthropic(api_key=s.anthropic_api_key), s.assistant_model, app.state.entropy,
                      Limits(s.assistant_daily_messages_per_user, s.assistant_user_daily_budget_usd,
                             s.assistant_daily_budget_usd, s.assistant_monthly_budget_usd,
                             s.assistant_max_tokens, s.assistant_max_tool_iterations))
            if s.assistant_enabled else None)
        yield
        if app.state.entropy.harvester:
            await app.state.entropy.harvester.stop()
        await client.aclose()

    docs = s.environment == "development"
    app = FastAPI(title="Quantum Password Generator", version=routes.VERSION, lifespan=lifespan,
                  docs_url="/api/docs" if docs else None, redoc_url=None,
                  openapi_url="/api/openapi.json" if docs else None)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    app.include_router(routes.router)
    app.include_router(assistant_api.router)
    app.include_router(webhooks.router)
    app.include_router(receipts_api.router)

    dist = Path(s.frontend_dist)
    if (dist / "index.html").exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):  # sync: filesystem checks run in the threadpool
            if path.startswith("api/") or "\x00" in path or "\\" in path:
                raise HTTPException(404)
            f = (dist / path).resolve()
            if path and f.is_file() and f.is_relative_to(dist.resolve()):
                return FileResponse(f)
            return FileResponse(dist / "index.html")

    app.add_middleware(SlowAPIMiddleware)
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=1_000_000)
    app.add_middleware(CORSMiddleware, allow_origins=s.allowed_origins, allow_credentials=True,
                       allow_methods=["GET", "POST", "DELETE"], allow_headers=["Authorization", "Content-Type"])
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=s.allowed_hosts)
    app.add_middleware(SecurityHeadersMiddleware, settings=s)
    if s.environment != "development" and s.auth_enabled and not any(
            "*" not in h and "accounts.dev" not in h for h in s.clerk_hosts):
        logging.getLogger(__name__).warning("CLERK_HOSTS has no production Frontend API host; sign-in will be blocked")
    return app


logging.basicConfig(level=logging.INFO)
app = create_app()
