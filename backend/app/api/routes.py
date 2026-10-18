from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from starlette.concurrency import run_in_threadpool

from .. import db
from ..auth import CurrentUser, optional_user, require_admin, require_user
from ..config import Settings, get_settings
from ..entropy import EntropyService
from ..generator import PasswordOptions, generate_passphrase, generate_password
from ..ratelimit import DRAWS_PER_USER_PER_DAY, general_limit, limiter
from ..receipts import build_receipt
from .deps import get_entropy, get_signer

router = APIRouter()
Entropy = Annotated[EntropyService, Depends(get_entropy)]
MaybeUser = Annotated[CurrentUser | None, Depends(optional_user)]
VERSION = "2.1.0"


async def _with_receipt(request: Request, body: dict, user: CurrentUser | None, kind: str, provenance: dict,
                        bits: float | None, secret: str, details: dict) -> dict:
    """Attach a hybrid post-quantum signed receipt; the salt is returned only to this caller."""
    receipt, salt = build_receipt(get_signer(request), kind, provenance, entropy_bits=bits, secret_value=secret,
                                  details=details)
    await run_in_threadpool(db.save_receipt, receipt, user.id if user else None)
    return body | {"receipt": receipt, "receipt_salt": salt}


def _uid(user: CurrentUser | None) -> str | None:
    return user.id if user else None


async def _password(entropy: EntropyService, user: CurrentUser | None, o: PasswordOptions) -> tuple[dict, dict]:
    res = await entropy.get_stream(_uid(user))
    try:
        pw, bits = generate_password(res.stream, o)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    p = res.provenance
    await run_in_threadpool(db.record_usage, user.id if user else None, "password", length=o.length,
                            entropy_bits=bits, sources=p.sources, quantum=p.quantum)
    return {"password": pw, "length": o.length, "entropy_bits": round(bits, 2), "provenance": p.as_dict()}, {
        "bits": bits}


@router.get("/api/v2/password")
@limiter.limit(general_limit)
async def password(
    request: Request, entropy: Entropy, user: MaybeUser,
    length: Annotated[int, Query(ge=4, le=128)] = 20,
    upper: bool = True, lower: bool = True, digits: bool = True, symbols: bool = True,
    exclude_ambiguous: bool = False, require_each: bool = True, receipt: bool = False,
):
    body, meta = await _password(entropy, user, PasswordOptions(length, upper, lower, digits, symbols,
                                                                exclude_ambiguous, require_each))
    if receipt:
        body = await _with_receipt(request, body, user, "password", body["provenance"], meta["bits"],
                                   body["password"], {"length": length})
    return body


@router.get("/api/v2/passphrase")
@limiter.limit(general_limit)
async def passphrase(
    request: Request, entropy: Entropy, user: MaybeUser,
    words: Annotated[int, Query(ge=3, le=16)] = 6,
    separator: Literal["-", "_", ".", " ", ""] = "-",
    capitalize: bool = False, add_number: bool = False, receipt: bool = False,
):
    res = await entropy.get_stream(_uid(user))
    phrase, bits = generate_passphrase(res.stream, words, separator, capitalize, add_number)
    p = res.provenance
    await run_in_threadpool(db.record_usage, user.id if user else None, "passphrase", length=words,
                            entropy_bits=bits, sources=p.sources, quantum=p.quantum)
    body = {"passphrase": phrase, "words": words, "entropy_bits": round(bits, 2), "provenance": p.as_dict()}
    if receipt:
        body = await _with_receipt(request, body, user, "passphrase", body["provenance"], bits, phrase,
                                   {"words": words})
    return body


@router.get("/api/v2/random")
@limiter.limit(general_limit)
async def random_bytes(request: Request, entropy: Entropy, user: MaybeUser,
                       bytes: Annotated[int, Query(ge=1, le=1024)] = 32, receipt: bool = False):  # noqa: A002
    res = await entropy.get_stream(_uid(user))
    data = res.stream.read(bytes)
    await run_in_threadpool(db.record_usage, user.id if user else None, "random", length=bytes,
                            sources=res.provenance.sources, quantum=res.provenance.quantum)
    body = {"hex": data.hex(), "bytes": bytes, "provenance": res.provenance.as_dict()}
    if receipt:
        body = await _with_receipt(request, body, user, "random", body["provenance"], bytes * 8.0, body["hex"],
                                   {"bytes": bytes})
    return body


@router.get("/api/v2/entropy/status")
@limiter.limit(general_limit)
async def entropy_status(request: Request, entropy: Entropy):
    return entropy.status()


@router.get("/api/v2/health")
async def health():
    return {"status": "ok", "version": VERSION}


@router.get("/api/v2/config")
async def public_config(s: Annotated[Settings, Depends(get_settings)]):
    return {"version": VERSION, "assistant_enabled": s.assistant_enabled, "auth_enabled": s.auth_enabled,
            "assistant_requires_sign_in": s.auth_enabled or s.environment != "development"}


@router.get("/api/v2/me")
@limiter.limit(general_limit)
async def me(request: Request, user: Annotated[CurrentUser, Depends(require_user)]):
    stats = await run_in_threadpool(db.user_stats, user.id)
    return {"id": user.id, "email": user.email, "name": user.name, "is_admin": user.is_admin, "stats": stats}


@router.get("/api/v2/me/receipts")
@limiter.limit(general_limit)
async def my_receipts(request: Request, user: Annotated[CurrentUser, Depends(require_user)],
                      before: datetime | None = None, limit: Annotated[int, Query(ge=1, le=200)] = 50):
    """Issuance history: receipt metadata only (receipts never contain secrets)."""
    items = await run_in_threadpool(db.list_user_receipts, user.id, before, limit)
    return {"items": items, "next_before": items[-1]["created_at"] if len(items) == limit else None}


@router.get("/api/v2/me/usage")
@limiter.limit(general_limit)
async def my_usage(request: Request, user: Annotated[CurrentUser, Depends(require_user)],
                   s: Annotated[Settings, Depends(get_settings)]):
    usage = await run_in_threadpool(db.usage_summary, user.id)
    return {**usage, "quotas": {
        "draws_per_day": DRAWS_PER_USER_PER_DAY,
        "assistant_messages_per_day": s.assistant_daily_messages_per_user,
        "assistant_budget_per_day_usd": s.assistant_user_daily_budget_usd,
        "ibm_seeds_per_day": s.pool_seeds_per_user_per_day,
        "rate_limit": s.rate_limit_user,
    }}


@router.get("/api/v2/admin/stats")
@limiter.limit(general_limit)
async def admin(request: Request, entropy: Entropy, user: Annotated[CurrentUser, Depends(require_admin)]):
    return await run_in_threadpool(db.admin_stats) | {"entropy": entropy.status(detail=True)}


# --- v1 compatibility ---------------------------------------------------------------------------

@router.get("/quantum-password", include_in_schema=False)
@limiter.limit(general_limit)
async def v1_password(request: Request, entropy: Entropy, user: MaybeUser,
                      length: Annotated[int, Query(ge=4, le=64)] = 12):
    r, _ = await _password(entropy, user, PasswordOptions(length=length, require_each=False))
    return {"quantum_password": r["password"], "length": length, "entropy_bits": r["entropy_bits"],
            "provenance": r["provenance"]}


@router.get("/quantum-random", include_in_schema=False)
@limiter.limit(general_limit)
async def v1_random(request: Request, entropy: Entropy, n: Annotated[int, Query(ge=1, le=64)] = 8):
    res = await entropy.get_stream(use_pool=False)
    value = int.from_bytes(res.stream.read((n + 7) // 8), "big") >> ((8 - n % 8) % 8)
    return {"quantum_bits": format(value, f"0{n}b"), "decimal_value": value, "hex_value": hex(value),
            "bits_requested": n, "provenance": res.provenance.as_dict()}
