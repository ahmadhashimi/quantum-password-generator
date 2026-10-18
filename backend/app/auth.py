"""Clerk authentication: verify the session JWT on the server for every protected request."""

import time
from dataclasses import dataclass

from clerk_backend_api.security import authenticate_request
from clerk_backend_api.security.types import AuthenticateRequestOptions
from fastapi import Depends, HTTPException, Request
from starlette.concurrency import run_in_threadpool

from . import db
from .config import Settings, get_settings


@dataclass
class CurrentUser:
    id: str
    email: str | None = None
    name: str | None = None
    role: str | None = None
    second_factor_age_min: int | None = None  # from Clerk's `fva` claim; None/-1 = no second factor

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"


DEV_USER = CurrentUser(id="dev_local", name="Local developer", role="admin")


def _verify(request: Request, s: Settings) -> CurrentUser | None:
    if "authorization" not in request.headers:
        return None
    state = authenticate_request(
        request,
        AuthenticateRequestOptions(secret_key=s.clerk_secret_key, jwt_key=s.clerk_jwt_key,
                                   authorized_parties=s.allowed_origins),
    )
    if not state.is_signed_in or not state.payload:
        return None
    p = state.payload
    # Role and profile fields come from a customised Clerk session token (see README):
    #   {"email": "{{user.primary_email_address}}", "name": "{{user.full_name}}",
    #    "metadata": "{{user.public_metadata}}"}
    meta = p.get("metadata") or {}
    fva = p.get("fva")
    second = fva[1] if isinstance(fva, list) and len(fva) == 2 and isinstance(fva[1], int) and fva[1] >= 0 else None
    return CurrentUser(id=p["sub"], email=p.get("email"), name=p.get("name"),
                       role=meta.get("role") if isinstance(meta, dict) else None, second_factor_age_min=second)


UPSERT_INTERVAL_S = 300
_last_upsert: dict[str, float] = {}


def _should_upsert(user_id: str) -> bool:
    """Record last-seen at most every 5 minutes per user instead of a DB write on every request."""
    now = time.monotonic()
    if now - _last_upsert.get(user_id, -UPSERT_INTERVAL_S) < UPSERT_INTERVAL_S:
        return False
    if len(_last_upsert) > 100_000:
        _last_upsert.clear()
    _last_upsert[user_id] = now
    return True


async def optional_user(request: Request, s: Settings = Depends(get_settings)) -> CurrentUser | None:
    if not s.auth_enabled:
        user = DEV_USER if s.environment == "development" else None
    else:
        user = await run_in_threadpool(_verify, request, s)
    if user:
        request.state.user_id = user.id
        if user is not DEV_USER and _should_upsert(user.id):
            await run_in_threadpool(db.upsert_user, user.id, user.email, user.name)
    return user


async def require_user(user: CurrentUser | None = Depends(optional_user)) -> CurrentUser:
    if user is None:
        raise HTTPException(401, "Sign in required")
    return user


async def require_admin(user: CurrentUser = Depends(require_user),
                        s: Settings = Depends(get_settings)) -> CurrentUser:
    if not user.is_admin:
        await run_in_threadpool(db.audit_throttled, user.id, "admin.denied", None, {"reason": "not_admin"})
        raise HTTPException(403, "Admin only")
    mfa_ok = user.second_factor_age_min is not None and user.second_factor_age_min <= 60
    if s.admin_require_mfa and user is not DEV_USER and not mfa_ok:
        await run_in_threadpool(db.audit_throttled, user.id, "admin.denied", None, {"reason": "mfa_required"})
        raise HTTPException(403, "Admin access requires a second factor verified in the last hour")
    return user
