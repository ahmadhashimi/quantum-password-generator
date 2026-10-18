"""Public verification of signed receipts, signing keys, and commit-then-run provably fair draws.

Draw protocol (prevents re-rolling until a favoured entry wins):
1. Commit: the organiser submits title + entries + winner count. We store them and return a signed
   *commit receipt* (entries fingerprint, no randomness yet) that the organiser publishes first.
2. Run: exactly once per draw (atomic status change), randomness is drawn and a signed *result receipt*
   references the commit. Every draw is in the public log, and verification reports how many draws the
   same organiser created over the same entry list, so grinding attempts are visible.
"""

import hashlib
import json
import re
import secrets
import unicodedata
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from starlette.concurrency import run_in_threadpool

from .. import db
from ..auth import CurrentUser, optional_user, require_admin
from ..config import Settings, get_settings
from ..generator import draw_winners
from ..entropy.mixer import KeyStream
from ..ratelimit import DRAWS_PER_USER_PER_DAY, general_limit, limiter
from ..receipts import build_receipt, check_commitment, verify_receipt
from .deps import get_entropy, get_keyring, get_signer

router = APIRouter()
MaybeUser = Annotated[CurrentUser | None, Depends(optional_user)]
MAX_ENTRIES = 10_000
MAX_ENTRIES_BYTES = 256_000
MAX_WINNERS = 100
_LINE_BREAKS = {"\u2028", "\u2029", "\x85"}
_URLISH = re.compile(r"(https?://|www\.|\b[a-z0-9-]+\.(com|net|org|io|xyz|app|co|gg|me|link|ru|cn)\b)", re.I)


def normalize_entry(raw: str) -> str:
    """NFC-normalise and trim; reject control characters so every client reproduces the same list."""
    entry = unicodedata.normalize("NFC", raw).strip()
    if not entry or len(entry) > 200:
        raise ValueError("Entries must be 1-200 characters")
    if any(unicodedata.category(ch).startswith("C") or ch in _LINE_BREAKS for ch in entry):
        raise ValueError("Entries can't contain control characters or line breaks")
    return entry


def normalize_entries(raw: list[str]) -> list[str]:
    """Normalise, reject duplicates, and sort into one canonical order.

    Sorting makes the fingerprint order-independent, so an organiser can't disguise re-rolls by shuffling the
    list; winner indexes refer to this canonical order, which any verifier reproduces from the published list.
    """
    entries = [normalize_entry(e) for e in raw]
    seen: set[str] = set()
    for e in entries:
        key = e.casefold()
        if key in seen:
            raise ValueError(f"Duplicate entry: {e!r}")
        seen.add(key)
    return sorted(entries)


def entries_hash(entries: list[str]) -> str:
    """SHA-256 of the normalised entries as a compact JSON array — anyone can recompute it from the list."""
    return hashlib.sha256(json.dumps(entries, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


@router.get("/api/v2/receipts/keys")
@router.get("/.well-known/quantumpass-keys.json", include_in_schema=False)
@limiter.limit(general_limit)
async def signing_keys(request: Request):
    return {"algorithms": ["ed25519", "ml-dsa-65"], "keys": get_keyring(request).public()}


@router.get("/api/v2/receipts/{receipt_id}")
@limiter.limit(general_limit)
async def get_receipt(request: Request, receipt_id: str):
    r = await run_in_threadpool(db.get_receipt, receipt_id[:64])
    if r is None:
        raise HTTPException(404, "Receipt not found")
    return r


class ReceiptIn(BaseModel):
    payload: dict[str, Any]
    signatures: dict[str, Annotated[str, Field(max_length=8192)]]
    algorithms: list[str] | None = None


class VerifyRequest(BaseModel):
    receipt: ReceiptIn | None = None
    receipt_id: str | None = Field(default=None, max_length=64)
    value: str | None = Field(default=None, max_length=4096)
    salt: str | None = Field(default=None, max_length=128)
    entries: list[Annotated[str, Field(max_length=400)]] | None = Field(default=None, max_length=MAX_ENTRIES)


@router.post("/api/v2/receipts/verify")
@limiter.limit(general_limit)
async def verify(request: Request, body: VerifyRequest):
    if body.receipt:
        receipt = body.receipt.model_dump()
    elif body.receipt_id:
        receipt = await run_in_threadpool(db.get_receipt, body.receipt_id)
    else:
        receipt = None
    if not receipt:
        raise HTTPException(422, "Provide a receipt or a known receipt_id")
    payload = receipt["payload"]
    check = verify_receipt(payload, receipt["signatures"], get_keyring(request))
    rid = payload.get("receipt_id")
    stored = await run_in_threadpool(db.get_receipt, rid) if isinstance(rid, str) else None
    result: dict[str, Any] = {
        **check,
        "key_id_matches": check.get("reason") != "unknown_key",
        "in_public_log": stored is not None and stored["payload"] == payload,
        "payload": payload,
    }
    if check["valid"] and body.value is not None and body.salt:
        result["commitment_matches"] = check_commitment(payload, body.value, body.salt)
    if body.entries is not None:
        try:
            normalized = normalize_entries(body.entries)
            details = payload.get("details") or {}
            result["entries_match"] = details.get("entries_sha256") == entries_hash(normalized)
            if payload.get("kind") == "draw" and check["valid"] and result["entries_match"]:
                selection = details.get("selection") or {}
                seed_hex = selection.get("seed_hex")
                if selection.get("algorithm") == "qpg-select/1" and isinstance(seed_hex, str) and len(seed_hex) == 128:
                    indexes = draw_winners(KeyStream(bytes.fromhex(seed_hex)), normalized, details["winners"])
                    result["selection_matches"] = indexes == [w["index"] for w in payload["result"]["winners"]]
                else:
                    result["selection_matches"] = False
        except (ValueError, TypeError, KeyError, AttributeError, IndexError):
            result["entries_match"] = False
            if payload.get("kind") == "draw":
                result["selection_matches"] = False
    if payload.get("kind") in ("draw_commit", "draw") and isinstance(rid, str):
        draw = await run_in_threadpool(db.draw_for_receipt, rid)
        if draw:
            result["draw"] = {
                "draw_id": draw.id,
                "status": draw.status,
                "commit_receipt_id": draw.commit_receipt_id,
                "result_receipt_id": draw.result_receipt_id,
                "draws_by_same_owner_over_same_entries": await run_in_threadpool(
                    db.sibling_draws, draw.owner_id, draw.entries_sha256),
                "draws_by_anyone_over_same_entries": await run_in_threadpool(
                    db.sibling_draws, None, draw.entries_sha256, True),
                "committed_seconds_before_run": draw.run_delay_s,
            }
    return result


class DrawCommit(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    entries: list[Annotated[str, Field(max_length=400)]] = Field(min_length=1, max_length=MAX_ENTRIES)
    winners: int = Field(default=1, ge=1, le=MAX_WINNERS)

    @field_validator("title")
    @classmethod
    def _title(cls, v: str) -> str:
        title = normalize_entry(v)
        if _URLISH.search(title):
            raise ValueError("Titles can't contain links")  # stops phishing text under an "Authentic" banner
        return title

    @field_validator("entries")
    @classmethod
    def _entries(cls, v: list[str]) -> list[str]:
        entries = normalize_entries(v)
        if sum(len(e.encode()) for e in entries) > MAX_ENTRIES_BYTES:
            raise ValueError("Entry list is too large")
        return entries


def _owner(user: CurrentUser | None, s: Settings) -> str | None:
    if user is None and s.environment != "development":
        raise HTTPException(401, "Sign in to run draws")
    return user.id if user else None


@router.post("/api/v2/draws")
@limiter.limit(general_limit)
async def commit_draw(request: Request, body: DrawCommit, user: MaybeUser,
                      s: Annotated[Settings, Depends(get_settings)]):
    owner = _owner(user, s)
    if body.winners > len(body.entries):
        raise HTTPException(422, "More winners than entries")
    if await run_in_threadpool(db.draws_today, owner) >= DRAWS_PER_USER_PER_DAY:
        raise HTTPException(429, f"Daily limit of {DRAWS_PER_USER_PER_DAY} draws reached")
    draw_id = secrets.token_urlsafe(12)
    details = {"draw_id": draw_id, "title": body.title, "entries_count": len(body.entries),
               "entries_sha256": entries_hash(body.entries), "winners": body.winners}
    no_randomness = {"sources": [], "quantum": False, "quantum_bytes": 0, "mixed_with": "none"}
    receipt, _ = build_receipt(get_signer(request), "draw_commit", no_randomness, details=details)
    await run_in_threadpool(db.commit_draw_tx, db.Draw(
        id=draw_id, owner_id=owner, title=body.title, entries_json=json.dumps(body.entries, ensure_ascii=False),
        entries_sha256=details["entries_sha256"], entries_count=len(body.entries), winners=body.winners,
        commit_receipt_id=receipt["payload"]["receipt_id"]), receipt, owner)
    return {"draw_id": draw_id, "commit_receipt": receipt,
            "commit_url": f"/#/verify/{receipt['payload']['receipt_id']}"}


def _calculate_result(draw: db.Draw, signer) -> tuple[dict, list[dict]]:
    """Deterministic and auditable: never consumes fresh entropy during recovery."""
    if not draw.seed_hex or not draw.seed_provenance:
        raise RuntimeError("Missing persistent draw seed; do not rerun")
    seed = bytes.fromhex(draw.seed_hex)
    if len(seed) != 64:
        raise RuntimeError("Invalid persisted draw seed")
    entries = json.loads(draw.entries_json or "[]")
    if entries_hash(entries) != draw.entries_sha256 or len(entries) != draw.entries_count:
        raise RuntimeError("Persisted draw entries mismatch their commitment")
    picked = draw_winners(KeyStream(seed), entries, draw.winners)
    public = {"winners": [{"index": i, "entry": entries[i]} for i in picked]}
    details = {"draw_id": draw.id, "title": draw.title, "entries_count": draw.entries_count,
               "entries_sha256": draw.entries_sha256, "winners": draw.winners,
               "commit_receipt_id": draw.commit_receipt_id,
               "selection": {"algorithm": "qpg-select/1", "seed_hex": draw.seed_hex}}
    receipt, _ = build_receipt(signer, "draw", json.loads(draw.seed_provenance),
                               public_result=public, details=details)
    return receipt, public["winners"]


@router.get("/api/v2/admin/audit")
@limiter.limit(general_limit)
async def audit_events(request: Request, user: Annotated[CurrentUser, Depends(require_admin)]):
    return {"events": await run_in_threadpool(db.audit_events_recent)}


@router.get("/api/v2/admin/audit/verify")
@limiter.limit(general_limit)
async def audit_integrity(request: Request, user: Annotated[CurrentUser, Depends(require_admin)]):
    return await run_in_threadpool(db.verify_audit_chain)


@router.get("/api/v2/admin/draws/interrupted")
@limiter.limit(general_limit)
async def interrupted_draws(request: Request, user: Annotated[CurrentUser, Depends(require_admin)]):
    return {"draws": await run_in_threadpool(db.list_interrupted_draws)}


@router.post("/api/v2/admin/draws/{draw_id}/complete")
@limiter.limit(general_limit)
async def complete_interrupted_draw(request: Request, draw_id: str,
                                    user: Annotated[CurrentUser, Depends(require_admin)]):
    draw = await run_in_threadpool(db.get_draw, draw_id)
    if not draw or draw.status != "needs_investigation":
        raise HTTPException(409, "Draw is not awaiting recovery")
    try:
        receipt, winners = _calculate_result(draw, get_signer(request))
        await run_in_threadpool(db.finish_draw_tx, draw.id, draw.owner_id, receipt)
    except (RuntimeError, ValueError, json.JSONDecodeError):
        raise HTTPException(409, "Cannot safely recover this draw; manual investigation required")
    return {"winners": winners, "receipt": receipt,
            "verify_url": f"/verify/{receipt['payload']['receipt_id']}"}


@router.post("/api/v2/draws/{draw_id}/run")
@limiter.limit(general_limit)
async def run_draw(request: Request, draw_id: str, user: MaybeUser, s: Annotated[Settings, Depends(get_settings)]):
    owner = _owner(user, s)
    # Do not expend entropy on invalid/previously executed requests.
    existing = await run_in_threadpool(db.get_draw, draw_id[:64])
    if not existing or existing.owner_id != owner or existing.status != "committed":
        raise HTTPException(409, "Draw not found, not yours, or already started")
    res = await get_entropy(request).get_stream(owner)
    seed = res.stream.read(64)
    draw = await run_in_threadpool(db.claim_draw_seeded, draw_id[:64], owner, seed, res.provenance.as_dict())
    if draw is None:
        raise HTTPException(409, "Draw already started; seed discarded")
    # Crash after claim leaves status 'seeded'. Recovery uses persisted seed, never a new random draw.
    receipt, winners = _calculate_result(draw, get_signer(request))
    await run_in_threadpool(db.finish_draw_tx, draw.id, owner, receipt)
    prov = json.loads(draw.seed_provenance)
    await run_in_threadpool(db.record_usage, owner, "draw", length=draw.entries_count,
                            sources=prov["sources"], quantum=prov["quantum"])
    return {"winners": winners, "receipt": receipt,
            "verify_url": f"/verify/{receipt['payload']['receipt_id']}"}
