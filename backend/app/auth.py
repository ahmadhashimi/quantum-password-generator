"""Clerk authentication: verify the session JWT on the server for every protected request."""

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
    return CurrentUser(id=p["sub"], email=p.get("email"), name=p.get("name"),
                       role=meta.get("role") if isinstance(meta, dict) else None)


async def optional_user(request: Request, s: Settings = Depends(get_settings)) -> CurrentUser | None:
    if not s.auth_enabled:
        user = DEV_USER if s.environment == "development" else None
    else:
        user = await run_in_threadpool(_verify, request, s)
    if user:
        request.state.user_id = user.id
        if user is not DEV_USER:
            await run_in_threadpool(db.upsert_user, user.id, user.email, user.name)
    return user


async def require_user(user: CurrentUser | None = Depends(optional_user)) -> CurrentUser:
    if user is None:
        raise HTTPException(401, "Sign in required")
    return user


async def require_admin(user: CurrentUser = Depends(require_user)) -> CurrentUser:
    if not user.is_admin:
        raise HTTPException(403, "Admin only")
    return user
