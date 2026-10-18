"""Public verification of signed receipts, signing keys, and commit-then-run provably fair draws.

Draw protocol (prevents re-rolling until a favoured entry wins):
1. Commit: the organiser submits title + entries + winner count. The draw row, its signed *commit receipt*
   (entries fingerprint, no randomness yet) and an audit event are written in ONE transaction.
2. Run: entropy is gathered, then the draw is claimed and its 64-byte selection seed persisted in one atomic
   statement (committed → seeded). From that moment the outcome is fixed: winners are a pure function of
   (seed, canonical entries). The result receipt, the status change (seeded → done) and an audit event are
   then written in ONE transaction. The seed is published in the result receipt so anyone can recompute it.
3. Retries never draw fresh randomness: a finished draw replays its stored result; a draw interrupted after
   seeding is flagged `needs_investigation` and can only be completed from its persisted seed by an admin.
Both endpoints accept an `Idempotency-Key` header (8-64 chars of [A-Za-z0-9_-]).
"""

import hashlib
import json
import re
import secrets
import unicodedata
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.exc import IntegrityError
from starlette.concurrency import run_in_threadpool

from .. import db
from ..auth import CurrentUser, optional_user
from ..config import Settings, get_settings
from ..generator import SELECTION_ALGORITHM, select_winners
from ..ratelimit import DRAWS_PER_USER_PER_DAY, general_limit, limiter
from ..receipts import SIGNING_DOMAIN, build_receipt, canonical, check_commitment, verify_receipt
from .deps import get_entropy, get_keyring, get_signer

router = APIRouter()
MaybeUser = Annotated[CurrentUser | None, Depends(optional_user)]
MAX_ENTRIES = 10_000
MAX_ENTRIES_BYTES = 256_000
MAX_WINNERS = 100
_LINE_BREAKS = {"\u2028", "\u2029", "\x85"}
IDEMPOTENCY_KEY = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
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


@router.get("/api/v2/receipts/keys", response_model=None)
@router.get("/.well-known/quantumpass-keys.json", include_in_schema=False, response_model=None)
@limiter.limit(general_limit)
async def signing_keys(request: Request) -> dict[str, Any]:
    return {"algorithms": ["ed25519", "ml-dsa-65"], "keys": get_keyring(request).public()}


RECEIPT_ID = re.compile(r"^[A-Za-z0-9_-]{16}$")


@router.get("/api/v2/receipts/{receipt_id}", response_model=None)
@limiter.limit(general_limit)
async def get_receipt(request: Request, receipt_id: str) -> dict[str, Any]:
    if not RECEIPT_ID.match(receipt_id):
        raise HTTPException(404, "Receipt not found")
    r = await run_in_threadpool(db.get_receipt, receipt_id)
    if r is None:
        raise HTTPException(404, "Receipt not found")
    return r


@router.get("/api/v2/receipts/{receipt_id}/verify-material", response_model=None)
@limiter.limit(general_limit)
async def receipt_verify_material(request: Request, receipt_id: str) -> dict[str, Any]:
    """Everything an independent verifier needs, byte-exact: the stored canonical payload (Python float formatting
    such as `128.0` can't be reproduced by JSON.stringify), the signing domain and the signing key's public entry.
    The key comes from this server too: compare its key_id with a copy of the key set you trust."""
    if not RECEIPT_ID.match(receipt_id):
        raise HTTPException(404, "Receipt not found")
    r = await run_in_threadpool(db.get_receipt, receipt_id)
    if r is None:
        raise HTTPException(404, "Receipt not found")
    key = get_keyring(request).get(r["payload"].get("key_id"))
    return {"receipt": r, "canonical_payload": canonical(r["payload"]).decode(),
            "signing_domain": SIGNING_DOMAIN.decode(), "public_key": key,
            "trust": "server-published key; not an independent attestation of quantum origin"}


class ReceiptIn(BaseModel):
    payload: dict[str, Any]
    signatures: dict[Annotated[str, Field(max_length=16)], Annotated[str, Field(max_length=8192)]] = Field(
        max_length=4)
    algorithms: list[Annotated[str, Field(max_length=16)]] | None = Field(default=None, max_length=4)


class VerifyRequest(BaseModel):
    receipt: ReceiptIn | None = None
    receipt_id: str | None = Field(default=None, max_length=64)
    value: str | None = Field(default=None, max_length=4096)
    salt: str | None = Field(default=None, max_length=128)
    entries: list[Annotated[str, Field(max_length=400)]] | None = Field(default=None, max_length=MAX_ENTRIES)


def _draw_details(payload: dict[str, Any]) -> dict[str, Any]:
    details = payload.get("details")
    return details if isinstance(details, dict) else {}


@router.post("/api/v2/receipts/verify", response_model=None)
@limiter.limit(general_limit)
async def verify(request: Request, body: VerifyRequest) -> dict[str, Any]:
    receipt: dict[str, Any] | None
    if body.receipt:
        receipt = body.receipt.model_dump()
    elif body.receipt_id and RECEIPT_ID.match(body.receipt_id):
        receipt = await run_in_threadpool(db.get_receipt, body.receipt_id)
    else:
        receipt = None
    if not receipt:
        raise HTTPException(422, "Provide a receipt or a known receipt_id")
    payload = receipt["payload"]
    check = verify_receipt(payload, receipt["signatures"], get_keyring(request))
    rid = payload.get("receipt_id")
    stored = await run_in_threadpool(db.get_receipt, rid) if isinstance(rid, str) and RECEIPT_ID.match(rid) else None
    result: dict[str, Any] = {
        **check,
        "key_id_matches": check.get("reason") not in ("unknown_key", "schema_invalid", "unsupported_version"),
        "in_public_log": stored is not None and stored["payload"] == payload,
        "payload": payload,
    }
    if not check["valid"]:
        return result  # nothing below is meaningful for a receipt that fails integrity checks
    if body.value is not None and body.salt:
        result["commitment_matches"] = check_commitment(payload, body.value, body.salt)
    details = _draw_details(payload)
    if body.entries is not None:
        try:
            normalized = normalize_entries(body.entries)
            result["entries_match"] = details.get("entries_sha256") == entries_hash(normalized)
            if payload.get("kind") == "draw":
                result["selection_recomputed"] = _recompute_selection(payload, normalized)
        except ValueError:
            result["entries_match"] = False
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


def _recompute_selection(payload: dict[str, Any], entries: list[str]) -> bool | None:
    """Re-run qpg-select/1 from the published seed; None when the receipt has no seed (v1)."""
    result = payload.get("result") or {}
    selection = result.get("selection")
    if not selection:
        return None
    picked = select_winners(bytes.fromhex(selection["seed_hex"]), entries, len(result["winners"]))
    return [w["index"] for w in result["winners"]] == picked and all(
        entries[w["index"]] == w["entry"] for w in result["winners"])


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


def _idem_key(raw: str | None) -> str | None:
    if raw is None:
        return None
    if not IDEMPOTENCY_KEY.match(raw):
        raise HTTPException(422, "Idempotency-Key must be 8-64 characters of A-Z a-z 0-9 _ -")
    return raw


def _replay(owner: str | None, endpoint: str, key: str | None, request_hash: str) -> JSONResponse | None:
    if key is None:
        return None
    rec = db.get_idempotent(owner or "dev", endpoint, key)
    if rec is None:
        return None
    if rec.request_hash != request_hash:
        raise HTTPException(422, "Idempotency-Key was already used with a different request")
    return JSONResponse(json.loads(rec.response_json), status_code=rec.status_code,
                        headers={"Idempotent-Replayed": "true"})


@router.post("/api/v2/draws", response_model=None)
@limiter.limit(general_limit)
async def commit_draw(request: Request, body: DrawCommit, user: MaybeUser,
                      s: Annotated[Settings, Depends(get_settings)],
                      idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
                      ) -> JSONResponse | dict[str, Any]:
    owner = _owner(user, s)
    key = _idem_key(idempotency_key)
    req_hash = db.request_fingerprint("POST /api/v2/draws", body.model_dump())
    if (replayed := await run_in_threadpool(_replay, owner, "draws.commit", key, req_hash)) is not None:
        return replayed
    if body.winners > len(body.entries):
        raise HTTPException(422, "More winners than entries")
    if await run_in_threadpool(db.draws_today, owner) >= DRAWS_PER_USER_PER_DAY:
        raise HTTPException(429, f"Daily limit of {DRAWS_PER_USER_PER_DAY} draws reached")
    draw_id = secrets.token_urlsafe(12)
    details: dict[str, Any] = {"draw_id": draw_id, "title": body.title, "entries_count": len(body.entries),
                               "entries_sha256": entries_hash(body.entries), "winners": body.winners}
    no_randomness = {"sources": [], "quantum": False, "quantum_bytes": 0, "mixed_with": "none"}
    receipt, _ = build_receipt(get_signer(request), "draw_commit", no_randomness, details=details)
    rid = receipt["payload"]["receipt_id"]
    response = {"draw_id": draw_id, "commit_receipt": receipt, "commit_url": f"/verify/{rid}"}
    draw = db.Draw(id=draw_id, owner_id=owner, title=body.title,
                   entries_json=json.dumps(body.entries, ensure_ascii=False),
                   entries_sha256=details["entries_sha256"], entries_count=len(body.entries), winners=body.winners,
                   commit_receipt_id=rid)
    idem = db.idempotency_row(owner or "dev", "draws.commit", key, req_hash, response) if key else None
    try:
        await run_in_threadpool(db.commit_draw_tx, draw, receipt, idem, DRAWS_PER_USER_PER_DAY)
    except db.DrawQuotaExceeded:
        raise HTTPException(429, f"Daily limit of {DRAWS_PER_USER_PER_DAY} draws reached") from None
    except IntegrityError:
        # A concurrent request with the same Idempotency-Key won; nothing of ours was written. Replay theirs.
        if (replayed := await run_in_threadpool(_replay, owner, "draws.commit", key, req_hash)) is not None:
            return replayed
        raise
    return response


def _result_from_receipt(receipt: dict[str, Any]) -> dict[str, Any]:
    rid = receipt["payload"]["receipt_id"]
    return {"winners": receipt["payload"]["result"]["winners"], "receipt": receipt, "verify_url": f"/verify/{rid}"}


async def _existing_outcome(draw: db.Draw) -> JSONResponse:
    """A draw that is no longer `committed`: replay its result, or report why it can't run."""
    if draw.status == db.DRAW_DONE and draw.result_receipt_id:
        stored = await run_in_threadpool(db.get_receipt, draw.result_receipt_id)
        if stored:
            return JSONResponse({**_result_from_receipt(stored), "replayed": True},
                                headers={"Idempotent-Replayed": "true"})
    messages = {db.DRAW_SEEDED: "This draw is being finalised; its outcome is already fixed. Retry shortly.",
                db.DRAW_INVESTIGATE: "This draw was interrupted after its outcome was fixed and is awaiting an "
                                     "operator to publish it. It will not be re-run."}
    detail = messages.get(draw.status, "Draw unavailable")
    return JSONResponse({"detail": detail, "status": draw.status}, status_code=409)


@router.post("/api/v2/draws/{draw_id}/run", response_model=None)
@limiter.limit(general_limit)
async def run_draw(request: Request, draw_id: str, user: MaybeUser, s: Annotated[Settings, Depends(get_settings)],
                   idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
                   ) -> JSONResponse | dict[str, Any]:
    owner = _owner(user, s)
    key = _idem_key(idempotency_key)
    if not RECEIPT_ID.match(draw_id):
        raise HTTPException(404, "Draw not found")
    req_hash = db.request_fingerprint("POST /api/v2/draws/run", {"draw_id": draw_id})
    if (replayed := await run_in_threadpool(_replay, owner, "draws.run", key, req_hash)) is not None:
        return replayed
    draw = await run_in_threadpool(db.get_draw, draw_id)
    if draw is None or draw.owner_id != owner:
        raise HTTPException(404, "Draw not found")
    if draw.status != db.DRAW_COMMITTED:
        return await _existing_outcome(draw)

    res = await get_entropy(request).get_stream(owner)
    prov = res.provenance.as_dict()
    seed = res.stream.key
    claimed = await run_in_threadpool(db.seed_draw, draw_id, owner, seed.hex(), prov)
    if claimed is None:  # a concurrent run claimed it first; our entropy is discarded unused
        current = await run_in_threadpool(db.get_draw, draw_id)
        if current is None:
            raise HTTPException(404, "Draw not found")
        return await _existing_outcome(current)

    receipt = _build_result_receipt(request, claimed, seed, prov)
    response = _result_from_receipt(receipt)
    idem = db.idempotency_row(owner or "dev", "draws.run", key, req_hash, response) if key else None
    if not await run_in_threadpool(db.finish_draw_tx, draw_id, receipt, actor=owner or "anonymous", idem=idem):
        current = await run_in_threadpool(db.get_draw, draw_id)
        return await _existing_outcome(current) if current else JSONResponse({"detail": "Draw not found"}, 404)
    await run_in_threadpool(db.record_usage, owner, "draw", length=claimed.entries_count,
                            sources=prov["sources"], quantum=prov["quantum"])
    return response


def _build_result_receipt(request: Request, draw: db.Draw, seed: bytes, prov: dict[str, Any],
                          recovered: bool = False) -> dict[str, Any]:
    entries = json.loads(draw.entries_json or "[]")
    picked = select_winners(seed, entries, draw.winners)
    public = {"winners": [{"index": i, "entry": entries[i]} for i in picked],
              "selection": {"algorithm": SELECTION_ALGORITHM, "seed_hex": seed.hex()}}
    details: dict[str, Any] = {"draw_id": draw.id, "title": draw.title, "entries_count": draw.entries_count,
                               "entries_sha256": draw.entries_sha256, "winners": draw.winners,
                               "commit_receipt_id": draw.commit_receipt_id}
    if recovered:
        details["recovered"] = True
    receipt, _ = build_receipt(get_signer(request), "draw", prov, public_result=public, details=details)
    return receipt


def complete_from_seed(request: Request, draw: db.Draw, actor: str) -> dict[str, Any] | None:
    """Admin recovery: publish an interrupted draw from its persisted seed (identical outcome, no new randomness)."""
    if draw.status != db.DRAW_INVESTIGATE or not draw.seed_hex or not draw.seed_provenance:
        return None
    prov = json.loads(draw.seed_provenance)
    receipt = _build_result_receipt(request, draw, bytes.fromhex(draw.seed_hex), prov, recovered=True)
    ok = db.finish_draw_tx(draw.id, receipt, actor=actor, action="draw.admin_complete",
                           from_status=db.DRAW_INVESTIGATE)
    return _result_from_receipt(receipt) if ok else None
