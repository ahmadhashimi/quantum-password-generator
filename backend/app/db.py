"""Persistence: users, usage metadata, the public receipt log, draws, idempotency records and the audit log.

Stores metadata only — never passwords, passphrases, random bytes handed to users, or chat contents.
Works on PostgreSQL (production, managed by Alembic migrations) and SQLite (tests and local development).
"""

import hashlib
import json
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from typing import Any, cast

from sqlalchemy import BigInteger, Column, Text, UniqueConstraint, delete, event, update
from sqlalchemy.engine import Engine
from sqlmodel import Field, Session, SQLModel, col, create_engine, func, select

from .config import get_settings


def _now() -> datetime:
    return datetime.now(UTC)


def _canonical(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


# --- tables ------------------------------------------------------------------------------------------------


class User(SQLModel, table=True):
    __tablename__ = "users"
    id: str = Field(primary_key=True)  # Clerk user id
    email: str | None = None
    name: str | None = None
    created_at: datetime = Field(default_factory=_now)
    last_seen: datetime = Field(default_factory=_now)
    deleted: bool = False
    # Newest Clerk webhook timestamp applied, in milliseconds (needs 64 bits).
    last_event_ts: int | None = Field(default=None, sa_column=Column(BigInteger, nullable=True))


class UsageEvent(SQLModel, table=True):
    __tablename__ = "usage_events"
    id: int | None = Field(default=None, primary_key=True)
    user_id: str | None = Field(default=None, index=True)
    kind: str = Field(index=True)  # password | passphrase | random | draw | assistant_message
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
    payload: str = Field(sa_column=Column(Text, nullable=False))  # canonical JSON, byte-identical to what was signed
    signatures: str = Field(sa_column=Column(Text, nullable=False))  # JSON
    created_at: datetime = Field(default_factory=_now, index=True)


DRAW_COMMITTED, DRAW_SEEDED, DRAW_DONE, DRAW_INVESTIGATE = "committed", "seeded", "done", "needs_investigation"


class Draw(SQLModel, table=True):
    """Commit-then-run draws with a durable execution state machine.

    committed → seeded (selection seed persisted atomically with the claim) → done.
    A draw left in `seeded` by a crash is moved to `needs_investigation`; it is never re-run with fresh
    randomness. Entries are kept until the draw completes, then wiped (their fingerprint stays).
    """

    __tablename__ = "draws"
    id: str = Field(primary_key=True)
    owner_id: str | None = Field(default=None, index=True)
    title: str
    entries_json: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    entries_sha256: str = Field(index=True)
    entries_count: int
    winners: int
    status: str = Field(default=DRAW_COMMITTED, index=True)
    commit_receipt_id: str = Field(index=True)
    result_receipt_id: str | None = Field(default=None, index=True)
    seed_hex: str | None = None  # 64-byte selection key; published in the result receipt after the run
    seed_provenance: str | None = Field(default=None, sa_column=Column(Text, nullable=True))  # JSON
    run_started_at: datetime | None = None
    run_delay_s: int | None = None  # seconds between commit and run, shown to verifiers
    created_at: datetime = Field(default_factory=_now, index=True)


class IdempotencyRecord(SQLModel, table=True):
    """Stored responses for client-supplied Idempotency-Key headers (one per owner + endpoint + key)."""

    __tablename__ = "idempotency_keys"
    __table_args__ = (UniqueConstraint("owner_id", "endpoint", "key", name="uq_idempotency_owner_endpoint_key"),)
    id: int | None = Field(default=None, primary_key=True)
    owner_id: str = Field(index=True)  # "anon:<ip>" is never used; idempotent endpoints require an owner
    endpoint: str
    key: str
    request_hash: str
    response_json: str = Field(sa_column=Column(Text, nullable=False))
    status_code: int = 200
    created_at: datetime = Field(default_factory=_now, index=True)


class AuditHead(SQLModel, table=True):
    """Single row holding the tip of the audit hash chain; locked while appending."""

    __tablename__ = "audit_head"
    id: int = Field(default=1, primary_key=True)
    seq: int = 0
    hash: str = "0" * 64


class AuditEvent(SQLModel, table=True):
    """Append-only, hash-chained security audit log. Never contains secrets."""

    __tablename__ = "audit_events"
    seq: int = Field(primary_key=True)
    ts: datetime = Field(default_factory=_now, index=True)
    actor: str
    action: str = Field(index=True)
    target: str | None = None
    details: str = Field(sa_column=Column(Text, nullable=False))  # canonical JSON
    prev_hash: str
    hash: str = Field(index=True)


# --- engine & sessions ------------------------------------------------------------------------------------

_engine: Engine | None = None
_audit_lock = threading.Lock()  # serialises chain appends within the process (SQLite has no row locks)


def engine() -> Engine:
    global _engine
    if _engine is None:
        url = get_settings().database_url
        if url.startswith("sqlite"):
            _engine = create_engine(url, connect_args={"check_same_thread": False})

            @event.listens_for(_engine, "connect")
            def _sqlite_pragmas(dbapi_conn, _record):  # type: ignore[no-untyped-def]
                cur = dbapi_conn.cursor()
                cur.execute("PRAGMA busy_timeout=5000")
                cur.execute("PRAGMA foreign_keys=ON")
                cur.close()
        else:
            _engine = create_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=5,
                                    connect_args={"options": "-c timezone=UTC"})
    return _engine


def is_postgres() -> bool:
    return engine().dialect.name == "postgresql"


def init_db() -> None:
    """Postgres: apply Alembic migrations (idempotent). SQLite (tests/dev): create tables directly."""
    if is_postgres():
        from .migrations import upgrade_head

        upgrade_head()
    else:
        SQLModel.metadata.create_all(engine())
    with session() as s:
        if s.get(AuditHead, 1) is None:
            s.add(AuditHead(id=1))
            s.commit()


def reset_engine() -> None:
    global _engine
    if _engine is not None:
        _engine.dispose()
    _engine = None


@contextmanager
def session() -> Iterator[Session]:
    with Session(engine()) as s:
        yield s


# --- audit log --------------------------------------------------------------------------------------------


def _event_hash(prev_hash: str, seq: int, ts: datetime, actor: str, action: str, target: str | None,
                details: str) -> str:
    body = _canonical({"seq": seq, "ts": ts.astimezone(UTC).isoformat(), "actor": actor, "action": action,
                       "target": target, "details": json.loads(details)})
    return hashlib.sha256(f"{prev_hash}\n{body}".encode()).hexdigest()


def append_audit(s: Session, actor: str, action: str, target: str | None = None,
                 details: dict[str, Any] | None = None) -> AuditEvent:
    """Append an event inside the caller's transaction (commit is the caller's job, so the event and the
    action it records commit or roll back together). Caller must hold `audit_lock()`."""
    head = s.exec(select(AuditHead).where(AuditHead.id == 1).with_for_update()).one()
    seq = head.seq + 1
    ts = _now()
    body = _canonical(details or {})
    h = _event_hash(head.hash, seq, ts, actor, action, target, body)
    ev = AuditEvent(seq=seq, ts=ts, actor=actor, action=action, target=target, details=body,
                    prev_hash=head.hash, hash=h)
    head.seq, head.hash = seq, h
    s.add(ev)
    s.add(head)
    return ev


@contextmanager
def audit_lock() -> Iterator[None]:
    with _audit_lock:
        yield


def audit(actor: str, action: str, target: str | None = None, details: dict[str, Any] | None = None) -> None:
    """Record a stand-alone audit event in its own transaction."""
    with audit_lock(), session() as s:
        append_audit(s, actor, action, target, details)
        s.commit()


_throttle: dict[tuple[str, str, str | None], float] = {}
_throttle_lock = threading.Lock()


def audit_throttled(actor: str, action: str, target: str | None = None, details: dict[str, Any] | None = None,
                    *, every_s: float = 600) -> None:
    """audit(), at most once per (actor, action, target) per `every_s` in this process: for events a caller can
    trigger repeatedly (denied admin access, an exhausted budget), so they can't flood the audit log."""
    key, now = (actor, action, target), time.monotonic()
    with _throttle_lock:
        if now - _throttle.get(key, float("-inf")) < every_s:
            return
        if len(_throttle) > 10_000:
            _throttle.clear()
        _throttle[key] = now
    audit(actor, action, target, details)


def last_audit(action: str) -> dict[str, Any] | None:
    with session() as s:
        r = s.exec(select(AuditEvent).where(AuditEvent.action == action).order_by(col(AuditEvent.seq).desc())
                   .limit(1)).first()
    return None if r is None else {"seq": r.seq, "target": r.target, "details": json.loads(r.details)}


def audit_times(action: str, target: str | None, within_s: float) -> list[float]:
    """Unix times of recent events with this action and target (e.g. QPU jobs submitted in the last 24 h)."""
    cutoff = _now() - timedelta(seconds=within_s)
    with session() as s:
        rows = s.exec(select(AuditEvent.ts).where(AuditEvent.action == action, AuditEvent.target == target,
                                                  AuditEvent.ts >= cutoff)).all()
    return [(ts if ts.tzinfo else ts.replace(tzinfo=UTC)).timestamp() for ts in rows]


def list_audit(after_seq: int = 0, limit: int = 100) -> list[dict[str, Any]]:
    with session() as s:
        rows = s.exec(select(AuditEvent).where(AuditEvent.seq > after_seq).order_by(col(AuditEvent.seq))
                      .limit(min(limit, 500))).all()
    return [{"seq": r.seq, "ts": r.ts.isoformat(), "actor": r.actor, "action": r.action, "target": r.target,
             "details": json.loads(r.details), "prev_hash": r.prev_hash, "hash": r.hash} for r in rows]


def verify_audit_chain() -> dict[str, Any]:
    """Recompute every link; report the first broken one. Detects edited, deleted or reordered rows."""
    prev, count = "0" * 64, 0
    with session() as s:
        head = s.get(AuditHead, 1)
        for r in s.exec(select(AuditEvent).order_by(col(AuditEvent.seq))):
            count += 1
            if r.seq != count or r.prev_hash != prev or \
                    _event_hash(prev, r.seq, r.ts, r.actor, r.action, r.target, r.details) != r.hash:
                return {"ok": False, "events": count, "first_bad_seq": r.seq}
            prev = r.hash
    head_ok = head is None or (head.seq == count and head.hash == prev)
    return {"ok": head_ok, "events": count, "first_bad_seq": None if head_ok else count, "head": prev}


# --- users & usage ----------------------------------------------------------------------------------------


def upsert_user(user_id: str, email: str | None = None, name: str | None = None, deleted: bool = False,
                event_ts: int | None = None) -> None:
    """Create/refresh a user. Deletion is a one-way tombstone; stale webhook events are ignored."""
    with session() as s:
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
        try:
            s.commit()
        except Exception:  # concurrent first insert of the same user: the other writer won, nothing to do
            s.rollback()


def record_usage(user_id: str | None, kind: str, *, length: int | None = None, entropy_bits: float | None = None,
                 sources: list[str] | None = None, quantum: bool = False, via_assistant: bool = False,
                 input_tokens: int | None = None, output_tokens: int | None = None,
                 cost_usd: float | None = None) -> int:
    with session() as s:
        ev = UsageEvent(user_id=user_id, kind=kind, length=length, entropy_bits=entropy_bits,
                        sources=",".join(sources or []), quantum=quantum, via_assistant=via_assistant,
                        input_tokens=input_tokens, output_tokens=output_tokens, cost_usd=cost_usd)
        s.add(ev)
        s.commit()
        s.refresh(ev)
        assert ev.id is not None  # noqa: S101 - set by the database on insert
        return ev.id


def update_usage_cost(event_id: int, input_tokens: int, output_tokens: int, cost_usd: float) -> None:
    with session() as s:
        ev = s.get(UsageEvent, event_id)
        if ev is None:
            return
        ev.input_tokens, ev.output_tokens, ev.cost_usd = input_tokens, output_tokens, cost_usd
        s.add(ev)
        s.commit()


def _start_of_day() -> datetime:
    return _now().replace(hour=0, minute=0, second=0, microsecond=0)


def _start_of_month() -> datetime:
    return _start_of_day().replace(day=1)


def assistant_messages_today(user_id: str) -> int:
    with session() as s:
        return s.exec(select(func.count()).where(UsageEvent.user_id == user_id,
                                                 UsageEvent.kind == "assistant_message",
                                                 UsageEvent.created_at >= _start_of_day())).one()


def assistant_spend(since: datetime, user_id: str | None = None) -> float:
    q = select(func.coalesce(func.sum(UsageEvent.cost_usd), 0.0)).where(UsageEvent.created_at >= since)
    if user_id is not None:
        q = q.where(UsageEvent.user_id == user_id)
    with session() as s:
        return float(cast(float, s.exec(q).one()))


def assistant_spend_today(user_id: str | None = None) -> float:
    return assistant_spend(_start_of_day(), user_id)


def assistant_spend_this_month(user_id: str | None = None) -> float:
    return assistant_spend(_start_of_month(), user_id)


def user_stats(user_id: str) -> dict[str, Any]:
    with session() as s:
        rows = s.exec(select(UsageEvent.kind, func.count()).where(UsageEvent.user_id == user_id)
                      .group_by(UsageEvent.kind)).all()
        quantum = s.exec(select(func.count()).where(UsageEvent.user_id == user_id, UsageEvent.quantum)).one()
    counts = {k: int(c) for k, c in rows}
    return {"counts": counts, "total": sum(counts.values()), "quantum": quantum}


def usage_summary(user_id: str) -> dict[str, Any]:
    """Per-user usage for today and this month (UTC), by kind, plus AI spend."""
    out: dict[str, Any] = {}
    with session() as s:
        for label, since in (("today", _start_of_day()), ("month", _start_of_month())):
            rows = s.exec(select(UsageEvent.kind, func.count()).where(UsageEvent.user_id == user_id,
                                                                      UsageEvent.created_at >= since)
                          .group_by(UsageEvent.kind)).all()
            out[label] = {k: int(c) for k, c in rows}
        draws_today_n = s.exec(select(func.count()).select_from(Draw).where(
            Draw.owner_id == user_id, Draw.created_at >= _start_of_day())).one()
    out["draws_today"] = draws_today_n
    out["assistant_spend_today_usd"] = round(assistant_spend_today(user_id), 4)
    out["assistant_spend_month_usd"] = round(assistant_spend_this_month(user_id), 4)
    return out


def _utc_day(col: Any) -> Any:
    """Calendar day in UTC regardless of the database session timezone."""
    if is_postgres():
        return func.date(func.timezone("UTC", col))
    return func.date(col)


def admin_stats() -> dict[str, Any]:
    day = _utc_day(UsageEvent.created_at)
    with session() as s:
        users = s.exec(select(func.count()).select_from(User).where(User.deleted == False)).one()  # noqa: E712
        events = {k: int(c) for k, c in s.exec(select(UsageEvent.kind, func.count()).group_by(UsageEvent.kind))}
        quantum = s.exec(select(func.count()).where(UsageEvent.quantum)).one()
        ai_cost = float(cast(float, s.exec(select(func.coalesce(func.sum(UsageEvent.cost_usd), 0.0))).one()))
        recent = s.exec(select(User).where(User.deleted == False)  # noqa: E712
                        .order_by(User.last_seen.desc()).limit(20)).all()  # type: ignore[attr-defined]
        daily = s.exec(select(day, func.count()).where(UsageEvent.created_at >= _start_of_day() - timedelta(days=29))
                       .group_by(day).order_by(day)).all()
        investigate = s.exec(select(Draw.id).where(Draw.status == DRAW_INVESTIGATE)).all()
    total = sum(events.values())
    return {
        "users": users,
        "events": events,
        "total_events": total,
        "quantum_share": (quantum / total) if total else 0.0,
        "assistant_cost_usd": round(ai_cost, 4),
        "assistant_cost_today_usd": round(assistant_spend_today(), 4),
        "daily": [{"date": str(d), "count": int(c)} for d, c in daily],
        "recent_users": [{"id": u.id, "email": u.email, "name": u.name, "last_seen": u.last_seen.isoformat()}
                         for u in recent],
        "draws_needing_investigation": list(investigate),
    }


def draws_needing_investigation() -> list[dict[str, Any]]:
    """Interrupted draws for operators: timing and seed provenance, never the seed itself."""
    with session() as s:
        rows = s.exec(select(Draw).where(Draw.status == DRAW_INVESTIGATE).order_by(col(Draw.created_at))).all()
    return [{"draw_id": d.id, "owner_id": d.owner_id, "title": d.title, "entries_count": d.entries_count,
             "winners": d.winners, "commit_receipt_id": d.commit_receipt_id, "created_at": d.created_at.isoformat(),
             "run_started_at": d.run_started_at.isoformat() if d.run_started_at else None,
             "seed_provenance": json.loads(d.seed_provenance) if d.seed_provenance else None} for d in rows]


# --- receipts ---------------------------------------------------------------------------------------------


def _receipt_row(receipt: dict[str, Any], user_id: str | None) -> Receipt:
    p = receipt["payload"]
    return Receipt(id=p["receipt_id"], kind=p["kind"], user_id=user_id, payload=_canonical(p),
                   signatures=_canonical(receipt["signatures"]))


def save_receipt(receipt: dict[str, Any], user_id: str | None) -> None:
    with session() as s:
        s.add(_receipt_row(receipt, user_id))
        s.commit()


def get_receipt(receipt_id: str) -> dict[str, Any] | None:
    with session() as s:
        r = s.get(Receipt, receipt_id)
    if r is None:
        return None
    return {"payload": json.loads(r.payload), "signatures": json.loads(r.signatures),
            "algorithms": ["ed25519", "ml-dsa-65"]}


def list_user_receipts(user_id: str, before: datetime | None = None, limit: int = 50) -> list[dict[str, Any]]:
    """Metadata of a user's receipts, newest first. Payloads hold commitments only, never secrets."""
    q = select(Receipt).where(Receipt.user_id == user_id)
    if before is not None:
        q = q.where(Receipt.created_at < before)
    with session() as s:
        rows = s.exec(q.order_by(Receipt.created_at.desc()).limit(min(limit, 200))).all()  # type: ignore[attr-defined]
    out = []
    for r in rows:
        p = json.loads(r.payload)
        prov = p.get("provenance") or {}
        out.append({"receipt_id": r.id, "kind": r.kind, "created_at": r.created_at.isoformat(),
                    "version": p.get("version"), "sources": prov.get("sources"), "quantum": prov.get("quantum"),
                    "entropy_bits": p.get("entropy_bits"), "key_id": p.get("key_id")})
    return out


def purge_anonymous_receipts(days: int = 30) -> int:
    """Retention: receipts not tied to an account expire after `days` (except those referenced by draws)."""
    with session() as s:
        referenced = select(Draw.commit_receipt_id).union(
            select(Draw.result_receipt_id).where(col(Draw.result_receipt_id).is_not(None)))
        res = s.exec(delete(Receipt).where(col(Receipt.user_id).is_(None),
                                           col(Receipt.created_at) < _now() - timedelta(days=days),
                                           col(Receipt.id).not_in(referenced)))
        s.commit()
        return int(res.rowcount or 0)


# --- idempotency ------------------------------------------------------------------------------------------


def request_fingerprint(endpoint: str, body: Any) -> str:
    return hashlib.sha256(f"{endpoint}\n{_canonical(body)}".encode()).hexdigest()


def get_idempotent(owner_id: str, endpoint: str, key: str) -> IdempotencyRecord | None:
    with session() as s:
        return s.exec(select(IdempotencyRecord).where(IdempotencyRecord.owner_id == owner_id,
                                                      IdempotencyRecord.endpoint == endpoint,
                                                      IdempotencyRecord.key == key)).first()


def idempotency_row(owner_id: str, endpoint: str, key: str, request_hash: str, response: Any,
                    status_code: int = 200) -> IdempotencyRecord:
    return IdempotencyRecord(owner_id=owner_id, endpoint=endpoint, key=key, request_hash=request_hash,
                             response_json=_canonical(response), status_code=status_code)


def purge_idempotency(days: int = 7) -> int:
    with session() as s:
        res = s.exec(delete(IdempotencyRecord).where(col(IdempotencyRecord.created_at) < _now() - timedelta(days=days)))
        s.commit()
        return int(res.rowcount or 0)


# --- draws ------------------------------------------------------------------------------------------------


class DrawQuotaExceeded(Exception):
    pass


def commit_draw_tx(draw: Draw, commit_receipt: dict[str, Any], idem: IdempotencyRecord | None,
                   max_per_day: int | None = None) -> None:
    """One transaction: draw row + commit receipt + audit event (+ idempotency record).

    Either all of them exist afterwards or none do. The audit event is appended first: it takes the audit-head row
    lock, which serialises concurrent commits, so the daily quota counted after it is exact. Raises IntegrityError
    if the idempotency key raced and DrawQuotaExceeded if the owner hit `max_per_day`.
    """
    with audit_lock(), session() as s:
        append_audit(s, draw.owner_id or "anonymous", "draw.commit", draw.id,
                     {"entries_sha256": draw.entries_sha256, "entries_count": draw.entries_count,
                      "winners": draw.winners, "commit_receipt_id": draw.commit_receipt_id})
        if max_per_day is not None and draw.owner_id is not None:
            today = s.exec(select(func.count()).select_from(Draw).where(Draw.owner_id == draw.owner_id,
                                                                        Draw.created_at >= _start_of_day())).one()
            if today >= max_per_day:
                raise DrawQuotaExceeded
        s.add(_receipt_row(commit_receipt, draw.owner_id))
        s.add(draw)
        if idem is not None:
            s.add(idem)
        s.commit()


def get_draw(draw_id: str) -> Draw | None:
    with session() as s:
        return s.get(Draw, draw_id)


def seed_draw(draw_id: str, owner_id: str | None, seed_hex: str, provenance: dict[str, Any]) -> Draw | None:
    """Claim a committed draw and persist its selection seed in the same atomic statement.

    Returns the claimed draw, or None if it doesn't exist, isn't owned by `owner_id`, or was already claimed.
    After this commits, the outcome is fixed: winners are a pure function of (seed, canonical entries).
    """
    with audit_lock(), session() as s:
        res = s.exec(update(Draw).where(col(Draw.id) == draw_id, col(Draw.status) == DRAW_COMMITTED,
                                        col(Draw.owner_id) == owner_id)
                     .values(status=DRAW_SEEDED, seed_hex=seed_hex, seed_provenance=_canonical(provenance),
                             run_started_at=_now()))
        if res.rowcount != 1:
            s.rollback()
            return None
        append_audit(s, owner_id or "anonymous", "draw.seeded", draw_id,
                     {"sources": provenance.get("sources"), "quantum": provenance.get("quantum")})
        s.commit()
        return s.get(Draw, draw_id)


def finish_draw_tx(draw_id: str, result_receipt: dict[str, Any], *, actor: str, action: str = "draw.run",
                   from_status: str = DRAW_SEEDED, idem: IdempotencyRecord | None = None) -> bool:
    """One transaction: result receipt + draw → done (only from `from_status`) + audit event."""
    with audit_lock(), session() as s:
        d = s.get(Draw, draw_id)
        if d is None or d.status != from_status:
            return False
        rid = result_receipt["payload"]["receipt_id"]
        s.add(_receipt_row(result_receipt, d.owner_id))
        created = d.created_at if d.created_at.tzinfo else d.created_at.replace(tzinfo=UTC)
        res = s.exec(update(Draw).where(Draw.id == draw_id, Draw.status == from_status)  # type: ignore[arg-type]
                     .values(status=DRAW_DONE, result_receipt_id=rid, entries_json=None,
                             run_delay_s=int((_now() - created).total_seconds())))
        if res.rowcount != 1:
            s.rollback()
            return False
        if idem is not None:
            s.add(idem)
        append_audit(s, actor, action, draw_id, {"result_receipt_id": rid})
        s.commit()
        return True


def mark_stuck_draws(older_than_s: int = 0) -> list[str]:
    """Crash recovery: a draw still `seeded` with no result is never re-run; flag it for investigation."""
    cutoff = _now() - timedelta(seconds=older_than_s)
    with audit_lock(), session() as s:
        stuck = s.exec(select(Draw).where(Draw.status == DRAW_SEEDED, Draw.run_started_at <= cutoff)).all()  # type: ignore[operator]
        for d in stuck:
            d.status = DRAW_INVESTIGATE
            s.add(d)
            append_audit(s, "system", "draw.needs_investigation", d.id,
                         {"reason": "seeded but no result recorded (process stopped mid-run)"})
        s.commit()
        return [d.id for d in stuck]


def sibling_draws(owner_id: str | None, entries_sha256: str, any_owner: bool = False) -> int:
    """How many draws were created over the same (canonical) entry list — exposes re-roll attempts publicly."""
    q = select(func.count()).select_from(Draw).where(Draw.entries_sha256 == entries_sha256)
    if not any_owner:
        q = q.where(Draw.owner_id == owner_id)
    with session() as s:
        return s.exec(q).one()


def draws_today(owner_id: str | None) -> int:
    with session() as s:
        return s.exec(select(func.count()).select_from(Draw).where(Draw.owner_id == owner_id,
                                                                   Draw.created_at >= _start_of_day())).one()


def draw_for_receipt(receipt_id: str) -> Draw | None:
    with session() as s:
        return s.exec(select(Draw).where((Draw.commit_receipt_id == receipt_id) |
                                         (Draw.result_receipt_id == receipt_id))).first()
