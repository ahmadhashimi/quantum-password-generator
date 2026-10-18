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


def upsert_user(user_id: str, email: str | None = None, name: str | None = None, deleted: bool = False) -> None:
    with Session(engine()) as s:
        u = s.get(User, user_id) or User(id=user_id)
        u.email = email or u.email
        u.name = name or u.name
        u.last_seen = _now()
        u.deleted = deleted
        s.add(u)
        s.commit()


def record_usage(user_id: str | None, kind: str, *, length: int | None = None, entropy_bits: float | None = None,
                 sources: list[str] | None = None, quantum: bool = False, via_assistant: bool = False,
                 input_tokens: int | None = None, output_tokens: int | None = None,
                 cost_usd: float | None = None) -> None:
    with Session(engine()) as s:
        s.add(UsageEvent(user_id=user_id, kind=kind, length=length, entropy_bits=entropy_bits,
                         sources=",".join(sources or []), quantum=quantum, via_assistant=via_assistant,
                         input_tokens=input_tokens, output_tokens=output_tokens, cost_usd=cost_usd))
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
                      payload=json.dumps(p, sort_keys=True), signatures=json.dumps(receipt["signatures"])))
        s.commit()


def get_receipt(receipt_id: str) -> dict | None:
    import json

    with Session(engine()) as s:
        r = s.get(Receipt, receipt_id)
    if r is None:
        return None
    return {"payload": json.loads(r.payload), "signatures": json.loads(r.signatures)}
