import ipaddress

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from .config import get_settings


def client_ip(request: Request) -> str:
    """IPv6 users typically control a whole /64, so they share one bucket instead of one per address."""
    ip = get_remote_address(request)
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return ip
    return str(ipaddress.ip_network(f"{ip}/64", strict=False)) if addr.version == 6 else ip


def rate_key(request: Request) -> str:
    uid = getattr(request.state, "user_id", None)
    return f"user:{uid}" if uid else f"ip:{client_ip(request)}"


def general_limit(key: str) -> str:
    s = get_settings()
    return s.rate_limit_user if key.startswith("user:") else s.rate_limit_anonymous


def assistant_limit() -> str:
    return get_settings().rate_limit_assistant


# Per-route limits (decorators) run after auth so signed-in users get their own bucket; the default limit is
# applied by SlowAPIMiddleware *before* any auth/body work, as a cheap per-IP flood guard on every route.
limiter = Limiter(key_func=rate_key, headers_enabled=False, default_limits=["300/minute"])

DRAWS_PER_USER_PER_DAY = 50
