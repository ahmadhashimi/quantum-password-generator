"""HTTP hardening: security headers, no-store on secrets, request body limits."""

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .config import Settings

# The API serves JSON only; the website's CSP (with Clerk hosts and a per-request nonce) lives in web/proxy.ts.
API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
DOCS_PATHS = ("/api/docs", "/api/openapi.json")  # Swagger UI, development only


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp, settings: Settings):
        self.app = app
        self.dev = settings.environment == "development"
        self.headers = [
            (b"x-content-type-options", b"nosniff"),
            (b"x-frame-options", b"DENY"),
            (b"referrer-policy", b"no-referrer"),
            (b"permissions-policy", b"camera=(), microphone=(), geolocation=(), payment=(), usb=()"),
            (b"cross-origin-opener-policy", b"same-origin"),
            (b"cross-origin-resource-policy", b"same-origin"),
        ]
        if not self.dev:
            self.headers.append((b"strict-transport-security", b"max-age=63072000; includeSubDomains; preload"))

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        path = scope["path"]
        csp = [] if self.dev and path.startswith(DOCS_PATHS) else [(b"content-security-policy", API_CSP.encode())]

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = [h for h in message.get("headers", []) if h[0].lower() != b"cache-control"]
                existing = {k.lower() for k, _ in headers}
                headers += [h for h in self.headers + csp if h[0] not in existing]
                # Responses can contain secrets (and receipts are per-user): never cache anywhere.
                headers += [(b"cache-control", b"no-store, max-age=0"), (b"pragma", b"no-cache")]
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_wrapper)


class BodySizeLimitMiddleware:
    """Reject request bodies over `max_bytes` (Content-Length and streamed), even without the reverse proxy."""

    def __init__(self, app: ASGIApp, max_bytes: int = 1_000_000):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        for name, value in scope.get("headers", []):
            if name == b"content-length" and value.isdigit() and int(value) > self.max_bytes:
                return await _too_large(send)
        seen = 0

        async def limited_receive() -> Message:
            nonlocal seen
            message = await receive()
            if message["type"] == "http.request":
                seen += len(message.get("body", b""))
                if seen > self.max_bytes:
                    raise _BodyTooLarge
            return message

        try:
            await self.app(scope, limited_receive, send)
        except _BodyTooLarge:
            await _too_large(send)


class _BodyTooLarge(Exception):
    pass


async def _too_large(send: Send) -> None:
    await send({"type": "http.response.start", "status": 413,
                "headers": [(b"content-type", b"application/json")]})
    await send({"type": "http.response.body", "body": b'{"detail":"Request body too large"}'})
