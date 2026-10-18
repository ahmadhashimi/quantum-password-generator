"""Operational audit events: breaker trips, QPU jobs (and the job cap surviving restarts), admin denials,
key rotation, budget kill switch."""

import time

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app import db
from app.config import get_settings
from app.entropy.ibm import IBMHarvester
from app.entropy.pool import EntropyPool
from app.entropy.service import BREAKER_THRESHOLD, EntropyService
from app.main import create_app
from app.receipts import Signer
from tests.conftest import FakeProvider


def actions(name=None):
    return [e for e in db.list_audit(limit=500) if name is None or e["action"] == name]


async def test_breaker_open_is_audited_once_without_raw_errors():
    db.init_db()
    events = []

    async def hook(action, target, details):
        events.append((action, target, details))

    svc = EntropyService([FakeProvider("lfd", error="lfd: HTTP 500 from https://secret.example/?key=abc")])
    svc.on_event = hook
    for _ in range(BREAKER_THRESHOLD + 3):
        await svc.get_stream()
    assert [e[0] for e in events] == ["provider.breaker_open"]
    assert events[0][1] == "lfd" and events[0][2]["cause"] == "error" and "secret" not in str(events[0])


def test_ibm_job_cap_survives_restart():
    """Jobs submitted before a restart still count against the rolling 24 h cap."""
    db.init_db()
    for _ in range(2):
        db.audit("system", "provider.ibm_job_submitted", "ibm_quantum", {"backend": "least_busy", "shots": 2048})
    h = IBMHarvester(EntropyPool(), "tok", None, None, 2048, 3600, 1, max_jobs_per_day=2)
    assert h.jobs_last_24h == 0
    h.restore_job_times(db.audit_times("provider.ibm_job_submitted", "ibm_quantum", 86_400))
    assert h.jobs_last_24h == 2
    with pytest.raises(RuntimeError, match="cap reached"):
        import asyncio
        asyncio.run(h.harvest_once())
    assert db.audit_times("provider.ibm_job_submitted", "ibm_simulator", 86_400) == []


async def test_simulator_harvest_is_audited():
    pytest.importorskip("qiskit_aer")
    db.init_db()
    h = IBMHarvester(EntropyPool(), None, None, None, 256, 1, 1, simulator=True, sim_qubits=64)
    seen = []

    async def hook(action, target, details):
        seen.append((action, target, details))

    h.on_event = hook
    await h.harvest_once()
    assert [a for a, _, _ in seen] == ["provider.ibm_job_submitted", "provider.ibm_harvest"]
    assert all(t == "ibm_simulator" for _, t, _ in seen) and seen[1][2]["conditioned_bytes"] > 0


def test_key_rotation_is_detected_at_startup():
    entropy = EntropyService([FakeProvider("lfd")])
    with TestClient(create_app(settings=get_settings(), entropy=entropy, signer=Signer.generate())):
        pass
    with TestClient(create_app(settings=get_settings(), entropy=entropy, signer=Signer.generate())):
        pass
    rotated = actions("key.rotated")
    loaded = actions("key.loaded")
    assert len(rotated) == 1 and len(loaded) == 2
    assert rotated[0]["details"]["previous"] == loaded[0]["target"] and rotated[0]["target"] == loaded[1]["target"]


def test_admin_denials_are_audited_and_throttled(monkeypatch):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.public_key().public_bytes(serialization.Encoding.PEM,
                                        serialization.PublicFormat.SubjectPublicKeyInfo).decode()
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test_dummy")
    monkeypatch.setenv("CLERK_JWT_KEY", pem)
    monkeypatch.setenv("ENVIRONMENT", "production")
    get_settings.cache_clear()
    db._throttle.clear()
    now = int(time.time())
    tok = jwt.encode({"sub": "user_mallory", "iat": now, "nbf": now, "exp": now + 60,
                      "azp": "http://localhost:3000", "sid": "s"}, key, algorithm="RS256")
    with TestClient(create_app(settings=get_settings(), entropy=EntropyService([FakeProvider("lfd")]))) as c:
        for _ in range(5):
            assert c.get("/api/v2/admin/audit", headers={"Authorization": f"Bearer {tok}"}).status_code == 403
    denied = actions("admin.denied")
    assert len(denied) == 1 and denied[0]["actor"] == "user_mallory"


def test_budget_kill_switch_is_audited():
    from app.assistant.agent import Limits
    from tests.test_assistant import FakeAPI, make_limited_app, msg

    db._throttle.clear()
    api = FakeAPI((200, msg([{"type": "text", "text": "Hi"}], "end_turn")))
    with make_limited_app(api, Limits(daily_budget_usd=1.0)) as c:
        db.record_usage("someone_else", "assistant_message", cost_usd=1.5)
        c.post("/api/v2/assistant/chat", json={"message": "hi"})
        c.post("/api/v2/assistant/chat", json={"message": "hi again"})
    kill = actions("budget.kill_switch")
    assert len(kill) == 1 and kill[0]["target"] == "assistant_daily"
