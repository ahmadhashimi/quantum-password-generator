"""HTTP hardening: security headers, no-store on secrets, log redaction."""

import logging
import re

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .config import Settings


def content_security_policy(s: Settings) -> str:
    clerk = " ".join(s.clerk_hosts)
    return "; ".join([
        "default-src 'self'",
        f"script-src 'self' {clerk} https://challenges.cloudflare.com",
        f"connect-src 'self' {clerk} https://clerk-telemetry.com",
        "img-src 'self' data: https://img.clerk.com",
        "style-src 'self' 'unsafe-inline'",  # Clerk components inject styles at runtime
        "font-src 'self' data:",
        "frame-src https://challenges.cloudflare.com",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "upgrade-insecure-requests",
    ])


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp, settings: Settings):
        self.app = app
        self.headers = [
            (b"content-security-policy", content_security_policy(settings).encode()),
            (b"x-content-type-options", b"nosniff"),
            (b"x-frame-options", b"DENY"),
            (b"referrer-policy", b"no-referrer"),
            (b"permissions-policy", b"camera=(), microphone=(), geolocation=(), payment=(), usb=()"),
            (b"cross-origin-opener-policy", b"same-origin"),
            (b"cross-origin-resource-policy", b"same-origin"),
        ]
        if settings.environment != "development":
            self.headers.append((b"strict-transport-security", b"max-age=63072000; includeSubDomains; preload"))

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        path = scope["path"]
        is_api = path.startswith("/api/") or path.startswith("/quantum-")
        is_hashed_asset = path.startswith("/assets/")  # Vite fingerprints these filenames

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                existing = {k.lower() for k, _ in headers}
                headers += [h for h in self.headers if h[0] not in existing]
                if is_api:  # API responses can contain secrets: never cache anywhere
                    headers = [h for h in headers if h[0].lower() != b"cache-control"]
                    headers += [(b"cache-control", b"no-store, max-age=0"), (b"pragma", b"no-cache")]
                elif is_hashed_asset:
                    headers.append((b"cache-control", b"public, max-age=31536000, immutable"))
                elif b"cache-control" not in existing:  # index.html etc.: always revalidate
                    headers.append((b"cache-control", b"no-cache"))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_wrapper)


_SECRET_RE = re.compile(r'("?(password|passphrase|value|quantum_password)"?\s*[:=]\s*)"[^"]*"', re.I)


class RedactSecretsFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        if _SECRET_RE.search(msg):
            record.msg, record.args = _SECRET_RE.sub(r'\1"[REDACTED]"', msg), ()
        return True


def install_log_redaction() -> None:
    f = RedactSecretsFilter()
    for name in ("", "uvicorn", "uvicorn.access", "uvicorn.error", "app"):
        logging.getLogger(name).addFilter(f)
