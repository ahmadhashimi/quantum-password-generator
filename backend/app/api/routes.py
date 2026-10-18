from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from starlette.concurrency import run_in_threadpool

from .. import db
from ..auth import CurrentUser, optional_user, require_admin, require_user
from ..config import Settings, get_settings
from ..entropy import EntropyService
from ..generator import PasswordOptions, generate_passphrase, generate_password
from ..ratelimit import general_limit, limiter
from .deps import get_entropy

router = APIRouter()
Entropy = Annotated[EntropyService, Depends(get_entropy)]
MaybeUser = Annotated[CurrentUser | None, Depends(optional_user)]
VERSION = "2.0.0"


async def _password(entropy: EntropyService, user: CurrentUser | None, o: PasswordOptions) -> dict:
    res = await entropy.get_stream()
    try:
        pw, bits = generate_password(res.stream, o)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    p = res.provenance
    await run_in_threadpool(db.record_usage, user.id if user else None, "password", length=o.length,
                            entropy_bits=bits, sources=p.sources, quantum=p.quantum)
    return {"password": pw, "length": o.length, "entropy_bits": round(bits, 2), "provenance": p.as_dict()}


@router.get("/api/v2/password")
@limiter.limit(general_limit)
async def password(
    request: Request, entropy: Entropy, user: MaybeUser,
    length: Annotated[int, Query(ge=4, le=128)] = 20,
    upper: bool = True, lower: bool = True, digits: bool = True, symbols: bool = True,
    exclude_ambiguous: bool = False, require_each: bool = True,
):
    return await _password(entropy, user, PasswordOptions(length, upper, lower, digits, symbols,
                                                          exclude_ambiguous, require_each))


@router.get("/api/v2/passphrase")
@limiter.limit(general_limit)
async def passphrase(
    request: Request, entropy: Entropy, user: MaybeUser,
    words: Annotated[int, Query(ge=3, le=16)] = 6,
    separator: Literal["-", "_", ".", " ", ""] = "-",
    capitalize: bool = False, add_number: bool = False,
):
    res = await entropy.get_stream()
    phrase, bits = generate_passphrase(res.stream, words, separator, capitalize, add_number)
    p = res.provenance
    await run_in_threadpool(db.record_usage, user.id if user else None, "passphrase", length=words,
                            entropy_bits=bits, sources=p.sources, quantum=p.quantum)
    return {"passphrase": phrase, "words": words, "entropy_bits": round(bits, 2), "provenance": p.as_dict()}


@router.get("/api/v2/random")
@limiter.limit(general_limit)
async def random_bytes(request: Request, entropy: Entropy, user: MaybeUser,
                       bytes: Annotated[int, Query(ge=1, le=1024)] = 32):  # noqa: A002
    res = await entropy.get_stream()
    data = res.stream.read(bytes)
    await run_in_threadpool(db.record_usage, user.id if user else None, "random", length=bytes,
                            sources=res.provenance.sources, quantum=res.provenance.quantum)
    return {"hex": data.hex(), "bytes": bytes, "provenance": res.provenance.as_dict()}


@router.get("/api/v2/entropy/status")
async def entropy_status(entropy: Entropy):
    return entropy.status()


@router.get("/api/v2/health")
async def health():
    return {"status": "ok", "version": VERSION}


@router.get("/api/v2/config")
async def public_config(s: Annotated[Settings, Depends(get_settings)]):
    return {"version": VERSION, "assistant_enabled": s.assistant_enabled, "auth_enabled": s.auth_enabled,
            "assistant_requires_sign_in": s.auth_enabled or s.environment != "development"}


@router.get("/api/v2/me")
async def me(user: Annotated[CurrentUser, Depends(require_user)]):
    stats = await run_in_threadpool(db.user_stats, user.id)
    return {"id": user.id, "email": user.email, "name": user.name, "is_admin": user.is_admin, "stats": stats}


@router.get("/api/v2/admin/stats")
async def admin(user: Annotated[CurrentUser, Depends(require_admin)]):
    return await run_in_threadpool(db.admin_stats)


# --- v1 compatibility ---------------------------------------------------------------------------

@router.get("/quantum-password", include_in_schema=False)
@limiter.limit(general_limit)
async def v1_password(request: Request, entropy: Entropy, user: MaybeUser,
                      length: Annotated[int, Query(ge=4, le=64)] = 12):
    r = await _password(entropy, user, PasswordOptions(length=length, require_each=False))
    return {"quantum_password": r["password"], "length": length, "entropy_bits": r["entropy_bits"],
            "provenance": r["provenance"]}


@router.get("/quantum-random", include_in_schema=False)
@limiter.limit(general_limit)
async def v1_random(request: Request, entropy: Entropy, n: Annotated[int, Query(ge=1, le=64)] = 8):
    res = await entropy.get_stream()
    value = int.from_bytes(res.stream.read((n + 7) // 8), "big") >> ((8 - n % 8) % 8)
    return {"quantum_bits": format(value, f"0{n}b"), "decimal_value": value, "hex_value": hex(value),
            "bits_requested": n, "provenance": res.provenance.as_dict()}
