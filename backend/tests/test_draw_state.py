"""Durable draw execution: transactions, idempotency, concurrency, crash recovery, cross-user isolation."""

import threading

import pytest
from fastapi.testclient import TestClient
from sqlmodel import select

from app import db
from app.config import get_settings
from app.entropy.service import EntropyService
from app.generator import select_winners
from app.main import create_app
from tests.conftest import FakeProvider

ENTRIES = [f"@p{i}" for i in range(30)]


@pytest.fixture
def client():
    with TestClient(create_app(settings=get_settings(), entropy=EntropyService([FakeProvider("lfd")]))) as c:
        yield c


def commit(client, key=None, entries=ENTRIES, winners=3):
    headers = {"Idempotency-Key": key} if key else {}
    return client.post("/api/v2/draws", json={"title": "Giveaway", "entries": entries, "winners": winners},
                       headers=headers)


def counts():
    with db.session() as s:
        return (len(s.exec(select(db.Draw)).all()), len(s.exec(select(db.Receipt)).all()))


def test_commit_is_idempotent(client):
    a = commit(client, key="key-aaaa-1111")
    b = commit(client, key="key-aaaa-1111")
    assert a.status_code == b.status_code == 200
    assert b.json() == a.json() and b.headers["Idempotent-Replayed"] == "true"
    assert counts() == (1, 1)  # one draw, one commit receipt


def test_idempotency_key_reuse_with_different_body_is_rejected(client):
    assert commit(client, key="key-bbbb-2222").status_code == 200
    r = commit(client, key="key-bbbb-2222", winners=2)
    assert r.status_code == 422 and "different request" in r.json()["detail"]


def test_malformed_idempotency_key_rejected(client):
    assert commit(client, key="bad key!").status_code == 422


def test_concurrent_commits_with_same_key_create_one_draw(client):
    results = []
    threads = [threading.Thread(target=lambda: results.append(commit(client, key="key-race-3333")))
               for _ in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert all(r.status_code == 200 for r in results)
    assert len({r.json()["draw_id"] for r in results}) == 1
    assert counts() == (1, 1)


def test_commit_is_transactional(client, monkeypatch):
    """If any part of the commit fails, neither the draw nor its receipt exists."""
    def boom(*a, **k):
        raise RuntimeError("audit store down")
    monkeypatch.setattr(db, "append_audit", boom)
    with pytest.raises(RuntimeError):
        commit(client)
    assert counts() == (0, 0)


def test_concurrent_runs_execute_once(client):
    draw_id = commit(client).json()["draw_id"]
    results = []
    threads = [threading.Thread(target=lambda: results.append(client.post(f"/api/v2/draws/{draw_id}/run")))
               for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    ok = [r for r in results if r.status_code == 200]
    assert ok, [r.text for r in results]
    assert len({r.json()["receipt"]["payload"]["receipt_id"] for r in ok}) == 1  # exactly one outcome
    assert all(r.status_code in (200, 409) for r in results)
    with db.session() as s:
        assert len(s.exec(select(db.Receipt).where(db.Receipt.kind == "draw")).all()) == 1


def test_run_replays_with_idempotency_key(client):
    draw_id = commit(client).json()["draw_id"]
    a = client.post(f"/api/v2/draws/{draw_id}/run", headers={"Idempotency-Key": "run-key-0001"})
    b = client.post(f"/api/v2/draws/{draw_id}/run", headers={"Idempotency-Key": "run-key-0001"})
    assert a.json()["receipt"] == b.json()["receipt"]


def test_crash_after_seeding_is_never_rerun(client, monkeypatch):
    draw_id = commit(client).json()["draw_id"]
    real_finish = db.finish_draw_tx
    monkeypatch.setattr(db, "finish_draw_tx", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("crash")))
    with pytest.raises(RuntimeError):
        client.post(f"/api/v2/draws/{draw_id}/run")
    monkeypatch.setattr(db, "finish_draw_tx", real_finish)

    seeded = db.get_draw(draw_id)
    assert seeded.status == db.DRAW_SEEDED and seeded.seed_hex
    expected = select_winners(bytes.fromhex(seeded.seed_hex), sorted(ENTRIES), 3)

    # While seeded, a retry must not draw new randomness.
    r = client.post(f"/api/v2/draws/{draw_id}/run")
    assert r.status_code == 409 and r.json()["status"] == "seeded"

    # Startup recovery flags it; it still refuses to run.
    assert db.mark_stuck_draws() == [draw_id]
    r = client.post(f"/api/v2/draws/{draw_id}/run")
    assert r.status_code == 409 and r.json()["status"] == "needs_investigation"

    # Admin completes it from the persisted seed: identical winners, marked as recovered.
    done = client.post(f"/api/v2/admin/draws/{draw_id}/complete")
    assert done.status_code == 200
    payload = done.json()["receipt"]["payload"]
    assert [w["index"] for w in payload["result"]["winners"]] == expected
    assert payload["details"]["recovered"] is True
    assert payload["result"]["selection"]["seed_hex"] == seeded.seed_hex
    # And now the normal run endpoint replays that published result.
    again = client.post(f"/api/v2/draws/{draw_id}/run")
    assert again.status_code == 200 and again.json()["receipt"] == done.json()["receipt"]
    assert client.post(f"/api/v2/admin/draws/{draw_id}/complete").status_code == 409


def test_selection_is_recomputable_by_anyone(client):
    draw_id = commit(client).json()["draw_id"]
    run = client.post(f"/api/v2/draws/{draw_id}/run").json()
    v = client.post("/api/v2/receipts/verify",
                    json={"receipt": run["receipt"], "entries": list(reversed(ENTRIES))}).json()
    assert v["valid"] and v["entries_match"] and v["selection_recomputed"] is True


def test_cross_user_isolation(monkeypatch):
    """User B can't run, replay or list user A's draws and receipts."""
    import time

    import jwt
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.public_key().public_bytes(serialization.Encoding.PEM,
                                        serialization.PublicFormat.SubjectPublicKeyInfo).decode()
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test_dummy")
    monkeypatch.setenv("CLERK_JWT_KEY", pem)
    monkeypatch.setenv("ENVIRONMENT", "production")
    get_settings.cache_clear()

    def auth(sub):
        now = int(time.time())
        tok = jwt.encode({"sub": sub, "iat": now, "nbf": now, "exp": now + 60, "azp": "http://localhost:3000",
                          "sid": "s"}, key, algorithm="RS256")
        return {"Authorization": f"Bearer {tok}"}

    with TestClient(create_app(settings=get_settings(), entropy=EntropyService([FakeProvider("lfd")]))) as c:
        a, b = auth("user_a"), auth("user_b")
        draw_id = c.post("/api/v2/draws", json={"title": "t", "entries": ["x", "y"], "winners": 1},
                         headers=a).json()["draw_id"]
        assert c.post(f"/api/v2/draws/{draw_id}/run", headers=b).status_code == 404
        c.get("/api/v2/password?receipt=true", headers=a)
        assert c.get("/api/v2/me/receipts", headers=b).json()["items"] == []
        assert len(c.get("/api/v2/me/receipts", headers=a).json()["items"]) == 2  # commit + password
        c.post(f"/api/v2/draws/{draw_id}/run", headers=a)
        # B can't replay A's run through a guessed idempotency key either.
        assert c.post(f"/api/v2/draws/{draw_id}/run", headers=b).status_code == 404
        assert c.get("/api/v2/admin/audit", headers=b).status_code == 403
        assert c.get("/api/v2/me/usage", headers=b).json()["today"] == {}


def test_usage_endpoint_reports_quotas(client):
    client.get("/api/v2/password")
    u = client.get("/api/v2/me/usage").json()
    assert u["today"]["password"] == 1 and u["quotas"]["draws_per_day"] == 50


def test_investigation_list_shows_timing_not_seed(client, monkeypatch):
    draw_id = commit(client).json()["draw_id"]
    monkeypatch.setattr(db, "finish_draw_tx", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("crash")))
    with pytest.raises(RuntimeError):
        client.post(f"/api/v2/draws/{draw_id}/run")
    db.mark_stuck_draws()
    listed = client.get("/api/v2/admin/draws/investigate").json()["draws"]
    assert [d["draw_id"] for d in listed] == [draw_id]
    assert listed[0]["run_started_at"] and listed[0]["seed_provenance"]["sources"] == ["lfd"]
    assert db.get_draw(draw_id).seed_hex not in str(listed)
