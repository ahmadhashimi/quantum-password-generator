"""Structured logging: JSON lines outside development, a request ID on every line, redaction of secret-shaped text.

Redaction runs in the formatter, on the fully rendered line including tracebacks, so it covers every logger
(ours, uvicorn's, libraries') rather than only the ones a filter was attached to. It is a backstop: code must
still never log secrets. The access log records the route template, never the raw path or query string, so
receipt ids, draw ids and request parameters stay out of logs.
"""

import contextvars
import json
import logging
import re
import secrets
import sys
import time
from datetime import UTC, datetime
from typing import Any

from starlette.types import ASGIApp, Message, Receive, Scope, Send

request_id: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")
REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{8,64}$")

_SENSITIVE_KEYS = (r"password|passphrase|quantum_password|secret|salt|seed(?:_hex)?|value|token|api[_-]?key|"
                   r"authorization|cookie|signing_keys?")
_REDACTIONS = [
    # key=value / "key": "value" / key: value, quoted or bare; also prefixed keys such as receipt_salt, x_api_key
    (re.compile(rf"""(["']?\b(?:\w+_)?(?:{_SENSITIVE_KEYS})\b["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;&}}\]]+)""",
                re.I),
     r"\1[REDACTED]"),
    (re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]+", re.I), "Bearer [REDACTED]"),
    (re.compile(r"\b(?:sk-ant-[A-Za-z0-9_-]{8,}|sk_(?:live|test)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9+/=]{8,}|"
                r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+)"), "[REDACTED]"),
]


def redact(text: str) -> str:
    for pattern, repl in _REDACTIONS:
        text = pattern.sub(repl, text)
    return text


class TextFormatter(logging.Formatter):
    def __init__(self) -> None:
        super().__init__("%(asctime)s %(levelname)s %(name)s [%(request_id)s] %(message)s")

    def format(self, record: logging.LogRecord) -> str:
        record.request_id = request_id.get()
        return redact(super().format(record))


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        # Redact each text field before JSON encoding: escaping would otherwise hide quoted secrets from the patterns.
        line: dict[str, Any] = {"ts": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
                      "level": record.levelname, "logger": record.name, "request_id": request_id.get(),
                      "msg": redact(record.getMessage())}
        if isinstance(http := getattr(record, "http", None), dict):
            line["http"] = http
        if record.exc_info:
            line["exc"] = redact(self.formatException(record.exc_info))
        if record.stack_info:
            line["stack"] = redact(self.formatStack(record.stack_info))
        return json.dumps(line, ensure_ascii=False, default=str)


def configure_logging(fmt: str = "text", level: str = "INFO") -> None:
    """Route every logger through one redacting handler on the root logger."""
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(JsonFormatter() if fmt == "json" else TextFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access", "httpx", "httpcore"):
        lg = logging.getLogger(name)
        lg.handlers, lg.propagate = [], True
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)  # replaced by our access log (no query strings)
    for noisy in ("httpx", "httpcore"):  # their INFO lines include full request URLs
        logging.getLogger(noisy).setLevel(logging.WARNING)


access_log = logging.getLogger("app.access")


class RequestContextMiddleware:
    """Assign a request ID (accepting a well-formed X-Request-ID), echo it back, and write one access-log line."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        incoming = next((v.decode("latin-1") for k, v in scope.get("headers", []) if k == b"x-request-id"), "")
        rid = incoming if REQUEST_ID_RE.match(incoming) else secrets.token_hex(8)
        token = request_id.set(rid)
        start, status = time.perf_counter(), 500

        async def send_wrapper(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                message["headers"] = [*message.get("headers", []), (b"x-request-id", rid.encode())]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            route = getattr(scope.get("route"), "path", None) or "(unmatched)"
            ms = round((time.perf_counter() - start) * 1000, 1)
            access_log.info("%s %s %s %.1fms", scope["method"], route, status, ms,
                            extra={"http": {"method": scope["method"], "route": route, "status": status,
                                            "duration_ms": ms}})
            request_id.reset(token)
