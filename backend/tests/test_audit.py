"""Hash-chained, append-only audit log."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app import db
from app.config import get_settings
from app.entropy.service import EntropyService
from app.main import create_app
from tests.conftest import FakeProvider


@pytest.fixture
def client():
    with TestClient(create_app(settings=get_settings(), entropy=EntropyService([FakeProvider("lfd")]))) as c:
        yield c


def test_actions_are_audited_and_chain_verifies(client):
    d = client.post("/api/v2/draws", json={"title": "t", "entries": ["a", "b"], "winners": 1}).json()
    client.post(f"/api/v2/draws/{d['draw_id']}/run")
    actions = [e["action"] for e in client.get("/api/v2/admin/audit").json()["events"]]
    assert actions[:1] == ["key.loaded"] and {"draw.commit", "draw.seeded", "draw.run"} <= set(actions)
    v = client.get("/api/v2/admin/audit/verify").json()
    assert v["ok"] is True and v["events"] == len(actions)


def test_audit_events_never_contain_secrets(client):
    pw = client.get("/api/v2/password?receipt=true").json()["password"]
    events = client.get("/api/v2/admin/audit").json()["events"]
    assert pw not in str(events)


def test_tampering_is_detected(client):
    db.audit("tester", "x.one", "t", {"n": 1})
    db.audit("tester", "x.two", "t", {"n": 2})
    if db.is_postgres():
        # The database itself refuses edits to audit rows.
        with pytest.raises(Exception, match="append-only"):
            with db.engine().begin() as conn:
                conn.execute(text("UPDATE audit_events SET actor = 'evil' WHERE seq = 2"))
        return
    with db.engine().begin() as conn:
        conn.execute(text("UPDATE audit_events SET details = :d WHERE action = 'x.one'"), {"d": '{"n":99}'})
    v = db.verify_audit_chain()
    assert v["ok"] is False and v["first_bad_seq"] is not None


def test_deleted_audit_row_is_detected(client):
    if db.is_postgres():
        pytest.skip("deletes are blocked by the append-only trigger on PostgreSQL")
    db.audit("tester", "x.one")
    db.audit("tester", "x.two")
    with db.engine().begin() as conn:
        conn.execute(text("DELETE FROM audit_events WHERE action = 'x.one'"))
    assert db.verify_audit_chain()["ok"] is False


def test_audit_endpoints_need_admin(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    get_settings.cache_clear()
    with TestClient(create_app(settings=get_settings(), entropy=EntropyService([FakeProvider("lfd")]))) as c:
        assert c.get("/api/v2/admin/audit").status_code == 401
        assert c.get("/api/v2/admin/audit/verify").status_code == 401
        assert c.post("/api/v2/admin/draws/AAAAAAAAAAAAAAAA/complete").status_code == 401
