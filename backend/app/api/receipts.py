"""Public verification of signed receipts, signing keys, and provably fair draws."""

import hashlib
import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from .. import db
from ..auth import CurrentUser, optional_user
from ..generator import draw_winners
from ..ratelimit import general_limit, limiter
from ..receipts import build_receipt, check_commitment, verify_signatures
from .deps import get_entropy, get_signer

router = APIRouter()
MaybeUser = Annotated[CurrentUser | None, Depends(optional_user)]


def entries_hash(entries: list[str]) -> str:
    """SHA-256 of the entries as a JSON array — the organiser publishes the list, anyone can recompute this."""
    return hashlib.sha256(json.dumps(entries, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


@router.get("/api/v2/receipts/keys")
@router.get("/.well-known/quantumpass-keys.json", include_in_schema=False)
async def signing_keys(request: Request):
    return {"algorithms": ["ed25519", "ml-dsa-65"], "keys": [get_signer(request).public_keys()]}


@router.get("/api/v2/receipts/{receipt_id}")
async def get_receipt(receipt_id: str):
    r = await run_in_threadpool(db.get_receipt, receipt_id[:64])
    if r is None:
        raise HTTPException(404, "Receipt not found")
    return r


class VerifyRequest(BaseModel):
    receipt: dict | None = None
    receipt_id: str | None = Field(default=None, max_length=64)
    value: str | None = Field(default=None, max_length=4096)
    salt: str | None = Field(default=None, max_length=128)
    entries: list[str] | None = Field(default=None, max_length=10_000)


@router.post("/api/v2/receipts/verify")
@limiter.limit(general_limit)
async def verify(request: Request, body: VerifyRequest):
    receipt = body.receipt or (body.receipt_id and await run_in_threadpool(db.get_receipt, body.receipt_id))
    if not receipt or "payload" not in receipt or "signatures" not in receipt:
        raise HTTPException(422, "Provide a receipt or a known receipt_id")
    payload = receipt["payload"]
    keys = get_signer(request).public_keys()
    sigs = verify_signatures(payload, receipt["signatures"], keys)
    result = {
        "valid": all(sigs.values()) and payload.get("key_id") == keys["key_id"],
        "signatures": sigs,
        "key_id_matches": payload.get("key_id") == keys["key_id"],
        "in_public_log": await run_in_threadpool(db.get_receipt, payload.get("receipt_id", "")) is not None,
        "payload": payload,
    }
    if body.value is not None and body.salt:
        result["commitment_matches"] = check_commitment(payload, body.value, body.salt)
    if body.entries is not None:
        result["entries_match"] = (payload.get("result") or {}).get("entries_sha256") == entries_hash(body.entries)
    return result


class DrawRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    entries: list[Annotated[str, Field(min_length=1, max_length=200)]] = Field(min_length=1, max_length=10_000)
    winners: int = Field(default=1, ge=1, le=1000)


@router.post("/api/v2/draw")
@limiter.limit(general_limit)
async def draw(request: Request, body: DrawRequest, user: MaybeUser):
    if body.winners > len(body.entries):
        raise HTTPException(422, "More winners than entries")
    res = await get_entropy(request).get_stream()
    picked = draw_winners(res.stream, body.entries, body.winners)
    prov = res.provenance.as_dict()
    public = {
        "title": body.title,
        "entries_count": len(body.entries),
        "entries_sha256": entries_hash(body.entries),
        "winners": [{"index": i, "entry": body.entries[i]} for i in picked],
    }
    receipt, _ = build_receipt(get_signer(request), "draw", prov, public_result=public)
    await run_in_threadpool(db.save_receipt, receipt, user.id if user else None)
    await run_in_threadpool(db.record_usage, user.id if user else None, "draw", length=len(body.entries),
                            sources=prov["sources"], quantum=prov["quantum"])
    receipt_id = receipt["payload"]["receipt_id"]
    return {"winners": public["winners"], "receipt": receipt, "verify_url": f"/#/verify/{receipt_id}"}
