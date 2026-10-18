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
from starlette.middleware.trustedhost import TrustedHostMiddleware

from . import db
from .api import assistant as assistant_api
from .api import routes, webhooks
from .assistant.agent import Assistant, Limits
from .config import Settings, get_settings
from .entropy import EntropyService
from .ratelimit import limiter
from .security import SecurityHeadersMiddleware, install_log_redaction


def create_app(settings: Settings | None = None, entropy: EntropyService | None = None,
               assistant: Assistant | None = None) -> FastAPI:
    s = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        install_log_redaction()
        db.init_db()
        client = httpx.AsyncClient(headers={"user-agent": "quantum-password-generator/2"})
        app.state.entropy = entropy or EntropyService.from_settings(s, client)
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

    dist = Path(s.frontend_dist)
    if (dist / "index.html").exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):  # sync: filesystem checks run in the threadpool
            if path.startswith("api/"):
                raise HTTPException(404)
            f = (dist / path).resolve()
            if path and f.is_file() and f.is_relative_to(dist.resolve()):
                return FileResponse(f)
            return FileResponse(dist / "index.html")

    app.add_middleware(CORSMiddleware, allow_origins=s.allowed_origins, allow_credentials=True,
                       allow_methods=["GET", "POST", "DELETE"], allow_headers=["Authorization", "Content-Type"])
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=s.allowed_hosts)
    app.add_middleware(SecurityHeadersMiddleware, settings=s)
    return app


logging.basicConfig(level=logging.INFO)
app = create_app()
