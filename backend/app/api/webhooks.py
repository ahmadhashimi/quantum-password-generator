"""Clerk webhooks (user.created / user.updated / user.deleted), verified with Svix signatures."""

import json
from typing import Annotated, Any, cast

from fastapi import APIRouter, Depends, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from svix.webhooks import Webhook, WebhookVerificationError

from .. import db
from ..config import Settings, get_settings

router = APIRouter()


def _primary_email(data: dict[str, Any]) -> str | None:
    primary = data.get("primary_email_address_id")
    for e in data.get("email_addresses") or []:
        if e.get("id") == primary:
            return cast(str | None, e.get("email_address"))
    return None


@router.post("/api/v2/webhooks/clerk", include_in_schema=False, response_model=None)
async def clerk_webhook(request: Request, s: Annotated[Settings, Depends(get_settings)]) -> dict[str, bool]:
    if not s.clerk_webhook_secret:
        raise HTTPException(404)
    body = await request.body()
    if len(body) > 256_000:
        raise HTTPException(413)
    try:
        Webhook(s.clerk_webhook_secret).verify(body, dict(request.headers))
        event = json.loads(body)
    except (WebhookVerificationError, ValueError) as e:
        raise HTTPException(400, "Invalid signature") from e
    kind, data = event.get("type"), event.get("data") or {}
    ts = event.get("timestamp") if isinstance(event.get("timestamp"), int) else None
    if kind in ("user.created", "user.updated") and isinstance(data.get("id"), str):
        name = " ".join(filter(None, [data.get("first_name"), data.get("last_name")])) or None
        await run_in_threadpool(db.upsert_user, data["id"], _primary_email(data), name, event_ts=ts)
    elif kind == "user.deleted" and isinstance(data.get("id"), str):
        await run_in_threadpool(db.upsert_user, data["id"], deleted=True, event_ts=ts)
        await run_in_threadpool(db.audit, "clerk-webhook", "user.deleted", data["id"][:64])
    return {"ok": True}
