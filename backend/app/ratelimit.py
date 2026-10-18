from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from .config import get_settings


def rate_key(request: Request) -> str:
    uid = getattr(request.state, "user_id", None)
    return f"user:{uid}" if uid else f"ip:{get_remote_address(request)}"


def general_limit(key: str) -> str:
    s = get_settings()
    return s.rate_limit_user if key.startswith("user:") else s.rate_limit_anonymous


def assistant_limit() -> str:
    return get_settings().rate_limit_assistant


limiter = Limiter(key_func=rate_key, headers_enabled=False)
