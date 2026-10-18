"""User + usage tracking. Stores metadata only — never passwords, passphrases, or chat contents."""

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
    status: str = Field(default="committed", index=True)  # committed -> running -> done
    commit_receipt_id: str
    result_receipt_id: str | None = None
    run_delay_s: int | None = None  # seconds between commit and run, shown to verifiers
    created_at: datetime = Field(default_factory=_now)


_engine = None


def engine():
    global _engine
    if _engine is None:
        url = get_settings().database_url
        args = {"check_same_thread": False} if url.startswith("sqlite") else {}
        _engine = create_engine(url, connect_args=args)
    return _engine


def init_db() -> None:
    SQLModel.metadata.create_all(engine())


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


def claim_draw(draw_id: str, owner_id: str | None) -> "Draw | None":
    """Atomically move a committed draw to running. Returns None if it doesn't exist, isn't owned, or already ran."""
    from sqlalchemy import update

    with Session(engine()) as s:
        res = s.exec(update(Draw).where(Draw.id == draw_id, Draw.status == "committed", Draw.owner_id == owner_id)
                     .values(status="running"))
        s.commit()
        return s.get(Draw, draw_id) if res.rowcount == 1 else None


def finish_draw(draw_id: str, result_receipt_id: str) -> None:
    with Session(engine()) as s:
        d = s.get(Draw, draw_id)
        d.status, d.result_receipt_id, d.entries_json = "done", result_receipt_id, None
        created = d.created_at if d.created_at.tzinfo else d.created_at.replace(tzinfo=UTC)
        d.run_delay_s = int((_now() - created).total_seconds())
        s.add(d)
        s.commit()


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
