"""User + usage tracking. Stores metadata only — never passwords, passphrases, or chat contents."""

import hashlib
import json
from datetime import UTC, datetime

from sqlmodel import Field, Session, SQLModel, create_engine, func, select

from .config import get_settings


def _now() -> datetime:
    return datetime.now(UTC)


class User(SQLModel, table=True):
    __tablename__ = "users"
    id: str = Field(primary_key=True)  # Clerk user id
    email: str | None = None
    name: str | None = None
    created_at: datetime = Field(default_factory=_now)
    last_seen: datetime = Field(default_factory=_now)
    deleted: bool = False
    last_event_ts: int | None = None  # newest Clerk webhook timestamp applied (ms)


class UsageEvent(SQLModel, table=True):
    __tablename__ = "usage_events"
    id: int | None = Field(default=None, primary_key=True)
    user_id: str | None = Field(default=None, index=True)
    kind: str = Field(index=True)  # password | passphrase | random | assistant_message
    length: int | None = None
    entropy_bits: float | None = None
    sources: str | None = None  # comma-separated provenance
    quantum: bool = False
    via_assistant: bool = False
    input_tokens: int | None = None
    output_tokens: int | None = None
    cost_usd: float | None = None
    created_at: datetime = Field(default_factory=_now, index=True)


class Receipt(SQLModel, table=True):
    """Public verification log. Holds only signed payloads (commitments, never secrets)."""

    __tablename__ = "receipts"
    id: str = Field(primary_key=True)
    kind: str = Field(index=True)
    user_id: str | None = Field(default=None, index=True)
    payload: str  # canonical JSON
    signatures: str  # JSON
    created_at: datetime = Field(default_factory=_now, index=True)


class Draw(SQLModel, table=True):
    """Commit-then-run draws. Entries are kept only until the draw runs, then wiped (the hash stays)."""

    __tablename__ = "draws"
    id: str = Field(primary_key=True)
    owner_id: str | None = Field(default=None, index=True)
    title: str
    entries_json: str | None = None
    entries_sha256: str = Field(index=True)
    entries_count: int
    winners: int
    status: str = Field(default="committed", index=True)  # committed -> seeded -> done / needs_investigation
    seed_hex: str | None = None  # public verification seed, never a credential or signing key
    seed_provenance: str | None = None  # JSON; exactly the entropy stream used for this seed
    run_started_at: datetime | None = None
    commit_receipt_id: str
    result_receipt_id: str | None = None
    run_delay_s: int | None = None  # seconds between commit and run, shown to verifiers
    created_at: datetime = Field(default_factory=_now)

class AuditHead(SQLModel, table=True):
    """Serialization point: row-locked when appending to the audit hash chain."""
    __tablename__ = "audit_head"
    id: int = Field(default=1, primary_key=True)
    last_hash: str = "0" * 64


class AuditEvent(SQLModel, table=True):
    """Tamper-evident chain, not tamper-proof against a DB administrator."""
    __tablename__ = "audit_events"
    id: int | None = Field(default=None, primary_key=True)
    timestamp: datetime = Field(default_factory=_now)
    actor: str
    action: str
    target: str
    details: str = "{}"
    previous_hash: str
    hash: str


def append_audit(session: Session, *, actor: str, action: str, target: str, details: dict | None = None) -> None:
    """Call *inside the same transaction* as the audited action."""
    head = session.exec(select(AuditHead).where(AuditHead.id == 1).with_for_update()).first()
    if head is None:
        # init_db seeds this row before requests begin.
        raise RuntimeError("audit head is missing")
    prior = head.last_hash
    timestamp = _now()
    detail_json = json.dumps(details or {}, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    body = json.dumps({"ts": timestamp.replace(tzinfo=None).isoformat(), "actor": actor,
                       "action": action, "target": target, "details": json.loads(detail_json)},
                      sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    digest = hashlib.sha256((prior + body).encode("utf-8")).hexdigest()
    session.add(AuditEvent(timestamp=timestamp, actor=actor, action=action, target=target,
                           details=detail_json, previous_hash=prior, hash=digest))
    head.last_hash = digest
    session.add(head)


def verify_audit_chain() -> dict:
    """Detect missing/modified events; anchor published checkpoints externally in V3."""
    previous = "0" * 64
    with Session(engine()) as session:
        rows = session.exec(select(AuditEvent).order_by(AuditEvent.id)).all()
        for event in rows:
            body = json.dumps({"ts": event.timestamp.replace(tzinfo=None).isoformat(),
                               "actor": event.actor, "action": event.action, "target": event.target,
                               "details": json.loads(event.details)}, sort_keys=True,
                              separators=(",", ":"), ensure_ascii=False)
            expected = hashlib.sha256((previous + body).encode("utf-8")).hexdigest()
            if event.previous_hash != previous or event.hash != expected:
                return {"valid": False, "first_broken_event_id": event.id}
            previous = event.hash
        head = session.get(AuditHead, 1)
        return {"valid": bool(head and head.last_hash == previous), "events": len(rows),
                "last_hash": previous}


_engine = None


def engine():
    global _engine
    if _engine is None:
        url = get_settings().database_url
        args = {"check_same_thread": False} if url.startswith("sqlite") else {}
        _engine = create_engine(url, connect_args=args)
    return _engine


def init_db() -> None:
    # Production will replace create_all with Alembic migrations; keep local/test bootstrap deterministic.
    SQLModel.metadata.create_all(engine())
    with Session(engine()) as session:
        if session.get(AuditHead, 1) is None:
            session.add(AuditHead(id=1))
            session.commit()


def reset_engine() -> None:
    global _engine
    _engine = None


def upsert_user(user_id: str, email: str | None = None, name: str | None = None, deleted: bool = False,
                event_ts: int | None = None) -> None:
    """Create/refresh a user. Deletion is a one-way tombstone; stale webhook events are ignored."""
    with Session(engine()) as s:
        u = s.get(User, user_id) or User(id=user_id)
        if u.deleted:
            return
        if event_ts is not None:
            if u.last_event_ts and event_ts < u.last_event_ts:
                return
            u.last_event_ts = event_ts
        if deleted:
            u.deleted, u.email, u.name = True, None, None
        else:
            u.email = email or u.email
            u.name = name or u.name
            u.last_seen = _now()
        s.add(u)
        s.commit()


def record_usage(user_id: str | None, kind: str, *, length: int | None = None, entropy_bits: float | None = None,
                 sources: list[str] | None = None, quantum: bool = False, via_assistant: bool = False,
                 input_tokens: int | None = None, output_tokens: int | None = None,
                 cost_usd: float | None = None) -> int:
    with Session(engine()) as s:
        ev = UsageEvent(user_id=user_id, kind=kind, length=length, entropy_bits=entropy_bits,
                        sources=",".join(sources or []), quantum=quantum, via_assistant=via_assistant,
                        input_tokens=input_tokens, output_tokens=output_tokens, cost_usd=cost_usd)
        s.add(ev)
        s.commit()
        return ev.id


def update_usage_cost(event_id: int, input_tokens: int, output_tokens: int, cost_usd: float) -> None:
    with Session(engine()) as s:
        ev = s.get(UsageEvent, event_id)
        ev.input_tokens, ev.output_tokens, ev.cost_usd = input_tokens, output_tokens, cost_usd
        s.add(ev)
        s.commit()


def _start_of_day() -> datetime:
    return _now().replace(hour=0, minute=0, second=0, microsecond=0)


def assistant_messages_today(user_id: str) -> int:
    with Session(engine()) as s:
        return s.exec(select(func.count()).where(UsageEvent.user_id == user_id,
                                                 UsageEvent.kind == "assistant_message",
                                                 UsageEvent.created_at >= _start_of_day())).one()


def assistant_spend(since: datetime, user_id: str | None = None) -> float:
    q = select(func.coalesce(func.sum(UsageEvent.cost_usd), 0.0)).where(UsageEvent.created_at >= since)
    if user_id is not None:
        q = q.where(UsageEvent.user_id == user_id)
    with Session(engine()) as s:
        return float(s.exec(q).one())


def assistant_spend_today(user_id: str | None = None) -> float:
    return assistant_spend(_start_of_day(), user_id)


def assistant_spend_this_month() -> float:
    return assistant_spend(_start_of_day().replace(day=1))


def user_stats(user_id: str) -> dict:
    with Session(engine()) as s:
        rows = s.exec(select(UsageEvent.kind, func.count()).where(UsageEvent.user_id == user_id)
                      .group_by(UsageEvent.kind)).all()
        quantum = s.exec(select(func.count()).where(UsageEvent.user_id == user_id, UsageEvent.quantum)).one()
    counts = dict(rows)
    return {"counts": counts, "total": sum(counts.values()), "quantum": quantum}


def admin_stats() -> dict:
    with Session(engine()) as s:
        users = s.exec(select(func.count()).select_from(User).where(User.deleted == False)).one()  # noqa: E712
        events = dict(s.exec(select(UsageEvent.kind, func.count()).group_by(UsageEvent.kind)).all())
        quantum = s.exec(select(func.count()).where(UsageEvent.quantum)).one()
        ai_cost = float(s.exec(select(func.coalesce(func.sum(UsageEvent.cost_usd), 0.0))).one())
        recent = s.exec(select(User).where(User.deleted == False).order_by(User.last_seen.desc()).limit(20)).all()  # noqa: E712
        daily = s.exec(select(func.date(UsageEvent.created_at), func.count())
                       .group_by(func.date(UsageEvent.created_at))
                       .order_by(func.date(UsageEvent.created_at).desc()).limit(30)).all()
    total = sum(events.values())
    return {
        "users": users,
        "events": events,
        "total_events": total,
        "quantum_share": (quantum / total) if total else 0.0,
        "assistant_cost_usd": round(ai_cost, 4),
        "assistant_cost_today_usd": round(assistant_spend_today(), 4),
        "daily": [{"date": str(d), "count": c} for d, c in reversed(daily)],
        "recent_users": [{"id": u.id, "email": u.email, "name": u.name, "last_seen": u.last_seen.isoformat()}
                         for u in recent],
    }


def save_receipt(receipt: dict, user_id: str | None) -> None:
    import json

    p = receipt["payload"]
    with Session(engine()) as s:
        s.add(Receipt(id=p["receipt_id"], kind=p["kind"], user_id=user_id,
                      payload=json.dumps(p, sort_keys=True, ensure_ascii=False),
                      signatures=json.dumps(receipt["signatures"])))
        s.commit()


def get_receipt(receipt_id: str) -> dict | None:
    import json

    with Session(engine()) as s:
        r = s.get(Receipt, receipt_id)
    if r is None:
        return None
    return {"payload": json.loads(r.payload), "signatures": json.loads(r.signatures)}


def create_draw(draw: "Draw") -> None:
    with Session(engine()) as s:
        s.add(draw)
        s.commit()


def get_draw(draw_id: str) -> "Draw | None":
    with Session(engine()) as s:
        return s.get(Draw, draw_id)


def commit_draw_tx(draw: "Draw", receipt: dict, owner_id: str | None) -> None:
    """A draw must never exist without its signed commitment (or vice versa)."""
    payload = receipt["payload"]
    with Session(engine()) as session:
        session.add(draw)
        session.add(Receipt(id=payload["receipt_id"], kind=payload["kind"], user_id=owner_id,
                            payload=json.dumps(payload, sort_keys=True, ensure_ascii=False),
                            signatures=json.dumps(receipt["signatures"])))
        append_audit(session, actor=owner_id or "anonymous", action="draw.commit",
                     target=draw.id, details={"entries_hash": draw.entries_sha256})
        session.commit()


def claim_draw_seeded(draw_id: str, owner_id: str | None, seed: bytes, provenance: dict) -> "Draw | None":
    """Persist selection seed before calculating winners, atomically claiming once-only execution."""
    from sqlalchemy import update

    if len(seed) != 64:
        raise ValueError("Draw seed must contain exactly 64 bytes")
    with Session(engine()) as session:
        updated = session.exec(
            update(Draw).where(Draw.id == draw_id, Draw.status == "committed",
                               Draw.owner_id == owner_id)
            .values(status="seeded", seed_hex=seed.hex(),
                    seed_provenance=json.dumps(provenance, sort_keys=True),
                    run_started_at=_now()))
        if updated.rowcount != 1:
            session.rollback()
            return None
        append_audit(session, actor=owner_id or "anonymous", action="draw.seeded",
                     target=draw_id, details={"seed_sha256": hashlib.sha256(seed).hexdigest()})
        session.commit()
        return session.get(Draw, draw_id)


def finish_draw_tx(draw_id: str, owner_id: str | None, receipt: dict) -> None:
    """Receipt and winner state are committed or rolled back together."""
    with Session(engine()) as session:
        draw = session.get(Draw, draw_id)
        if draw is None or draw.owner_id != owner_id or draw.status not in ("seeded", "needs_investigation"):
            raise ValueError("Draw is not eligible for completion")
        payload = receipt["payload"]
        if (payload.get("details") or {}).get("draw_id") != draw_id:
            raise ValueError("Result receipt references a different draw")
        session.add(Receipt(id=payload["receipt_id"], kind=payload["kind"], user_id=owner_id,
                            payload=json.dumps(payload, sort_keys=True, ensure_ascii=False),
                            signatures=json.dumps(receipt["signatures"])))
        draw.status, draw.result_receipt_id, draw.entries_json = "done", payload["receipt_id"], None
        created = draw.created_at if draw.created_at.tzinfo else draw.created_at.replace(tzinfo=UTC)
        draw.run_delay_s = int((_now() - created).total_seconds())
        session.add(draw)
        append_audit(session, actor=owner_id or "anonymous", action="draw.finish",
                     target=draw_id, details={"receipt_id": payload["receipt_id"]})
        session.commit()


def mark_interrupted_draws() -> int:
    """Recovery fails closed: never select a new seed after an interrupted execution."""
    with Session(engine()) as session:
        stale = session.exec(select(Draw).where(Draw.status == "seeded")).all()
        for draw in stale:
            draw.status = "needs_investigation"
            session.add(draw)
            append_audit(session, actor="system", action="draw.needs_investigation",
                         target=draw.id, details={})
        session.commit()
        return len(stale)


def list_interrupted_draws() -> list[dict]:
    with Session(engine()) as session:
        return [{"id": d.id, "owner_id": d.owner_id, "created_at": d.created_at.isoformat()}
                for d in session.exec(select(Draw).where(Draw.status == "needs_investigation")).all()]


def sibling_draws(owner_id: str | None, entries_sha256: str, any_owner: bool = False) -> int:
    """How many draws were created over the same (canonical) entry list — exposes re-roll attempts publicly."""
    q = select(func.count()).where(Draw.entries_sha256 == entries_sha256)
    if not any_owner:
        q = q.where(Draw.owner_id == owner_id)
    with Session(engine()) as s:
        return s.exec(q).one()


def draws_today(owner_id: str | None) -> int:
    with Session(engine()) as s:
        return s.exec(select(func.count()).where(Draw.owner_id == owner_id,
                                                 Draw.created_at >= _start_of_day())).one()


def purge_anonymous_receipts(days: int = 30) -> int:
    """Retention: receipts not tied to an account expire after `days`."""
    from datetime import timedelta

    from sqlalchemy import delete

    with Session(engine()) as s:
        res = s.exec(delete(Receipt).where(Receipt.user_id.is_(None),
                                           Receipt.created_at < _now() - timedelta(days=days)))
        s.commit()
        return res.rowcount


def draw_for_receipt(receipt_id: str) -> "Draw | None":
    with Session(engine()) as s:
        return s.exec(select(Draw).where((Draw.commit_receipt_id == receipt_id) |
                                         (Draw.result_receipt_id == receipt_id))).first()

def audit_events_recent(limit: int = 100) -> list[dict]:
    """Admin-only query. Never put plaintext credentials in audit details."""
    with Session(engine()) as session:
        rows = session.exec(select(AuditEvent).order_by(AuditEvent.id.desc()).limit(min(limit, 100))).all()
        return [{"id": e.id, "timestamp": e.timestamp.isoformat(), "actor": e.actor,
                 "action": e.action, "target": e.target, "details": json.loads(e.details),
                 "hash": e.hash, "previous_hash": e.previous_hash} for e in rows]
