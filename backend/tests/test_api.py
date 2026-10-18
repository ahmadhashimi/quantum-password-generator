import base64
import json
import time

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app.config import get_settings
from app.entropy.service import EntropyService
from app.main import create_app
from tests.conftest import FakeProvider


def make_client(**env) -> TestClient:
    return TestClient(create_app(settings=get_settings(), entropy=EntropyService([FakeProvider("lfd")])))


@pytest.fixture
def client():
    with make_client() as c:
        yield c


def test_password_endpoint(client):
    r = client.get("/api/v2/password", params={"length": 32, "symbols": False})
    assert r.status_code == 200
    body = r.json()
    assert len(body["password"]) == 32 and body["entropy_bits"] > 180
    assert body["provenance"]["quantum"] is True and body["provenance"]["sources"] == ["lfd"]
    assert body["provenance"]["mixed_with"] == "os_csprng"


@pytest.mark.parametrize("params", [{"length": 3}, {"length": 129}, {"length": "x"},
                                    {"upper": False, "lower": False, "digits": False, "symbols": False}])
def test_password_validation(client, params):
    assert client.get("/api/v2/password", params=params).status_code == 422


def test_passphrase_endpoint(client):
    r = client.get("/api/v2/passphrase", params={"words": 5, "separator": "."})
    assert r.status_code == 200 and len(r.json()["passphrase"].split(".")) == 5
    assert client.get("/api/v2/passphrase", params={"separator": "<script>"}).status_code == 422


def test_random_and_v1_compat(client):
    assert len(client.get("/api/v2/random", params={"bytes": 16}).json()["hex"]) == 32
    v1 = client.get("/quantum-password", params={"length": 12}).json()
    assert len(v1["quantum_password"]) == 12
    bits = client.get("/quantum-random", params={"n": 12}).json()
    assert len(bits["quantum_bits"]) == 12 and int(bits["quantum_bits"], 2) == bits["decimal_value"]


def test_status_and_config(client):
    client.get("/api/v2/password")
    st = client.get("/api/v2/entropy/status").json()
    assert st["quantum_available"] is True
    cfg = client.get("/api/v2/config").json()
    assert cfg["assistant_enabled"] is False and cfg["auth_enabled"] is False


def test_security_headers_and_no_store(client):
    r = client.get("/api/v2/password")
    h = r.headers
    assert h["cache-control"].startswith("no-store")
    assert "frame-ancestors 'none'" in h["content-security-policy"]
    assert h["x-frame-options"] == "DENY" and h["x-content-type-options"] == "nosniff"
    assert h["referrer-policy"] == "no-referrer"


def test_unknown_api_paths_404_not_spa(client):
    assert client.get("/api/v2/nope").status_code == 404


def test_cors_blocks_unknown_origin(client):
    r = client.options("/api/v2/password", headers={"Origin": "https://evil.example",
                                                    "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in r.headers


def test_rate_limit(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_ANONYMOUS", "3/minute")
    monkeypatch.setenv("ENVIRONMENT", "production")
    get_settings.cache_clear()
    with make_client() as c:
        codes = [c.get("/api/v2/password").status_code for _ in range(5)]
    assert codes == [200, 200, 200, 429, 429]


def test_production_hides_docs_and_requires_auth(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    get_settings.cache_clear()
    with make_client() as c:
        assert c.get("/api/docs").status_code == 404
        assert c.get("/api/v2/me").status_code == 401
        assert c.post("/api/v2/assistant/chat", json={"message": "hi"}).status_code == 401
        assert "strict-transport-security" in c.get("/api/v2/health").headers


# --- Clerk auth ----------------------------------------------------------------------------------

@pytest.fixture
def clerk(monkeypatch):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.public_key().public_bytes(serialization.Encoding.PEM,
                                        serialization.PublicFormat.SubjectPublicKeyInfo).decode()
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test_dummy")
    monkeypatch.setenv("CLERK_JWT_KEY", pem)
    monkeypatch.setenv("ENVIRONMENT", "production")
    get_settings.cache_clear()

    def token(sub="user_123", role=None, azp="http://localhost:3000", exp_in=60, fva=None):
        now = int(time.time())
        claims = {"sub": sub, "iat": now, "nbf": now, "exp": now + exp_in, "azp": azp, "sid": "sess_1",
                  "iss": "https://test.clerk.accounts.dev", "email": "a@b.co", "name": "Ada",
                  "metadata": {"role": role} if role else {}}
        if fva is not None:
            claims["fva"] = fva
        return jwt.encode(claims, key, algorithm="RS256")

    return token


def test_clerk_valid_token_tracks_user(clerk):
    with make_client() as c:
        h = {"Authorization": f"Bearer {clerk()}"}
        c.get("/api/v2/password", headers=h)
        c.get("/api/v2/passphrase", headers=h)
        me = c.get("/api/v2/me", headers=h).json()
    assert me["id"] == "user_123" and me["email"] == "a@b.co"
    assert me["stats"]["counts"] == {"password": 1, "passphrase": 1} and me["stats"]["quantum"] == 2


@pytest.mark.parametrize("kwargs", [{"exp_in": -120}, {"azp": "https://evil.example"}])
def test_clerk_rejects_bad_tokens(clerk, kwargs):
    with make_client() as c:
        assert c.get("/api/v2/me", headers={"Authorization": f"Bearer {clerk(**kwargs)}"}).status_code == 401


def test_clerk_rejects_forged_signature(clerk):
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    forged = jwt.encode({"sub": "user_x", "exp": int(time.time()) + 60, "iat": int(time.time())}, other,
                        algorithm="RS256")
    with make_client() as c:
        assert c.get("/api/v2/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


def test_admin_stats_requires_admin(clerk):
    with make_client() as c:
        assert c.get("/api/v2/admin/stats", headers={"Authorization": f"Bearer {clerk()}"}).status_code == 403
        c.get("/api/v2/password", headers={"Authorization": f"Bearer {clerk()}"})
        no_mfa = c.get("/api/v2/admin/stats", headers={"Authorization": f"Bearer {clerk('admin_1', role='admin')}"})
        stale_mfa = c.get("/api/v2/admin/stats",
                          headers={"Authorization": f"Bearer {clerk('admin_1', role='admin', fva=[5, 600])}"})
        r = c.get("/api/v2/admin/stats",
                  headers={"Authorization": f"Bearer {clerk('admin_1', role='admin', fva=[5, 2])}"})
    assert no_mfa.status_code == 403 and "second factor" in no_mfa.json()["detail"]
    assert stale_mfa.status_code == 403
    assert r.status_code == 200
    assert r.json()["users"] == 2 and r.json()["events"]["password"] == 1


# --- Clerk webhooks ------------------------------------------------------------------------------

def test_clerk_webhook_signature(monkeypatch):
    from svix.webhooks import Webhook

    secret = "whsec_" + base64.b64encode(b"0123456789abcdef0123456789abcdef").decode()
    monkeypatch.setenv("CLERK_WEBHOOK_SECRET", secret)
    get_settings.cache_clear()
    payload = json.dumps({"type": "user.created", "data": {
        "id": "user_wh", "first_name": "Grace", "last_name": "Hopper", "primary_email_address_id": "e1",
        "email_addresses": [{"id": "e1", "email_address": "grace@example.com"}]}})
    from datetime import UTC, datetime
    ts = datetime.now(UTC)
    sig = Webhook(secret).sign("msg_1", ts, payload)
    headers = {"svix-id": "msg_1", "svix-timestamp": str(int(ts.timestamp())), "svix-signature": sig}
    with make_client() as c:
        assert c.post("/api/v2/webhooks/clerk", content=payload, headers=headers).status_code == 200
        bad = dict(headers, **{"svix-signature": "v1,AAAA"})
        assert c.post("/api/v2/webhooks/clerk", content=payload, headers=bad).status_code == 400
    from sqlmodel import Session

    from app import db
    with Session(db.engine()) as s:
        u = s.get(db.User, "user_wh")
    assert u.email == "grace@example.com" and u.name == "Grace Hopper"


def test_spoofed_forwarded_for_is_ignored_without_trusted_proxy(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_ANONYMOUS", "2/minute")
    monkeypatch.setenv("ENVIRONMENT", "production")  # no auto-signed-in dev user
    get_settings.cache_clear()
    with make_client() as c:
        codes = [c.get("/api/v2/password", headers={"X-Forwarded-For": f"10.0.0.{i}"}).status_code for i in range(3)]
    assert codes[-1] == 429  # rotating the header doesn't reset the limit


def test_defaults_are_safe(monkeypatch):
    """No ENVIRONMENT set: production mode, no auto-admin, localhost-only Host header."""
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.delenv("ALLOWED_HOSTS", raising=False)
    get_settings.cache_clear()
    from app.config import Settings

    s = Settings(_env_file=None)
    assert s.environment == "production" and s.allowed_hosts == ["localhost", "127.0.0.1"]
    with TestClient(create_app(settings=s, entropy=EntropyService([FakeProvider("lfd")])),
                    base_url="http://localhost") as c:
        assert c.get("/api/v2/me").status_code == 401
        assert c.get("/api/v2/health", headers={"Host": "evil.example"}).status_code == 400  # DNS rebinding


def test_deleted_users_stay_deleted_and_stale_events_ignored():
    from sqlmodel import Session

    from app import db
    db.init_db()
    db.upsert_user("u1", "a@b.co", "Ada", event_ts=100)
    db.upsert_user("u1", deleted=True, event_ts=200)
    db.upsert_user("u1", "a@b.co", "Ada", event_ts=150)  # out-of-order retry
    db.upsert_user("u1", "a@b.co", "Ada")  # later request with an old token
    with Session(db.engine()) as s:
        u = s.get(db.User, "u1")
    assert u.deleted and u.email is None and u.name is None


def test_body_size_limit(client):
    r = client.post("/api/v2/receipts/verify", content=b"x" * 1_100_000, headers={"content-type": "application/json"})
    assert r.status_code == 413


def test_api_responses_are_locked_down_json(client):
    """The API serves JSON only: nothing cacheable, nothing framable, no content allowed to load."""
    for path in ("/api/v2/health", "/.well-known/quantumpass-keys.json", "/api/v2/nope"):
        h = client.get(path).headers
        assert h["cache-control"].startswith("no-store")
        assert h["content-security-policy"].startswith("default-src 'none'")


def test_no_spa_catch_all(client):
    """The website is served by Next.js now; FastAPI 404s anything it doesn't route (including NUL paths)."""
    assert client.get("/").status_code == 404
    assert client.get("/verify/AAAAAAAAAAAAAAAA").status_code == 404
    assert client.get("/foo%00bar").status_code == 404

