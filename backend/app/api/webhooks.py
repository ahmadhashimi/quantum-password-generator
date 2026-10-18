"""Clerk webhooks (user.created / user.updated / user.deleted), verified with Svix signatures."""

import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from svix.webhooks import Webhook, WebhookVerificationError

from .. import db
from ..config import Settings, get_settings

router = APIRouter()


def _primary_email(data: dict) -> str | None:
    primary = data.get("primary_email_address_id")
    for e in data.get("email_addresses") or []:
        if e.get("id") == primary:
            return e.get("email_address")
    return None


@router.post("/api/v2/webhooks/clerk", include_in_schema=False)
async def clerk_webhook(request: Request, s: Annotated[Settings, Depends(get_settings)]):
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
    if kind in ("user.created", "user.updated"):
        name = " ".join(filter(None, [data.get("first_name"), data.get("last_name")])) or None
        await run_in_threadpool(db.upsert_user, data["id"], _primary_email(data), name)
    elif kind == "user.deleted" and data.get("id"):
        await run_in_threadpool(db.upsert_user, data["id"], deleted=True)
    return {"ok": True}
