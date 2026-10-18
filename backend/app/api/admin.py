"""Operator endpoints: audit log, chain verification, and recovery of interrupted draws. Admin + recent MFA."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from starlette.concurrency import run_in_threadpool

from .. import db
from ..auth import CurrentUser, require_admin
from ..ratelimit import general_limit, limiter
from .receipts import RECEIPT_ID, complete_from_seed

router = APIRouter(prefix="/api/v2/admin")
Admin = Annotated[CurrentUser, Depends(require_admin)]


@router.get("/audit", response_model=None)
@limiter.limit(general_limit)
async def audit_events(request: Request, admin: Admin, after: Annotated[int, Query(ge=0)] = 0,
                       limit: Annotated[int, Query(ge=1, le=500)] = 100) -> dict[str, Any]:
    return {"events": await run_in_threadpool(db.list_audit, after, limit)}


@router.get("/audit/verify", response_model=None)
@limiter.limit(general_limit)
async def audit_verify(request: Request, admin: Admin) -> dict[str, Any]:
    return await run_in_threadpool(db.verify_audit_chain)


@router.get("/draws/investigate", response_model=None)
@limiter.limit(general_limit)
async def draws_needing_investigation(request: Request, admin: Admin) -> dict[str, Any]:
    return {"draws": await run_in_threadpool(db.draws_needing_investigation)}


@router.post("/draws/{draw_id}/complete", response_model=None)
@limiter.limit(general_limit)
async def complete_draw(request: Request, draw_id: str, admin: Admin) -> dict[str, Any]:
    """Publish an interrupted draw from its persisted seed: the same winners it was always going to have."""
    if not RECEIPT_ID.match(draw_id):
        raise HTTPException(404, "Draw not found")
    draw = await run_in_threadpool(db.get_draw, draw_id)
    if draw is None:
        raise HTTPException(404, "Draw not found")
    result = await run_in_threadpool(complete_from_seed, request, draw, admin.id)
    if result is None:
        raise HTTPException(409, f"Draw is '{draw.status}', only 'needs_investigation' draws can be completed")
    return result
