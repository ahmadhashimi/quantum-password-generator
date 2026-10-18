"""Structured logging, request IDs, redaction, and an end-to-end scan proving secrets never reach logs or the DB."""

import json
import logging
import sys

import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel

from app import db
from app.config import get_settings
from app.entropy.service import EntropyService
from app.logging_setup import JsonFormatter, TextFormatter, redact
from app.main import create_app
from tests.conftest import FakeProvider


@pytest.fixture
def client():
    with TestClient(create_app(settings=get_settings(), entropy=EntropyService([FakeProvider("lfd")]))) as c:
        yield c


@pytest.mark.parametrize("raw,leak", [
    ('{"password": "hunter2-xyz"}', "hunter2-xyz"),
    ("password=hunter2-xyz&length=20", "hunter2-xyz"),
    ("passphrase: 'correct-horse-battery'", "correct-horse-battery"),
    ('"receipt_salt": "c2FsdHNhbHQ"', "c2FsdHNhbHQ"),
    ("seed_hex=" + "ab" * 64, "ab" * 64),
    ("Authorization: Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.c2ln", "eyJhbGciOiJSUzI1NiJ9"),
    ("using key sk-ant-api03-AAAAAAAAAAAAAAAA", "sk-ant-api03-AAAAAAAAAAAAAAAA"),
    ("clerk sk_live_ABCDEFGH12345678 failed", "sk_live_ABCDEFGH12345678"),
    ("token=abc.def.ghi", "abc.def.ghi"),
])
def test_redaction(raw, leak):
    out = redact(raw)
    assert leak not in out and "[REDACTED]" in out


@pytest.mark.parametrize("benign", ["draw abc interrupted after seeding", "ValueError: bad input",
                                    "input_tokens=120 output_tokens=40", "GET /api/v2/password 200 3.1ms"])
def test_redaction_leaves_ordinary_lines_alone(benign):
    assert redact(benign) == benign


def _record(msg, *args, exc=None):
    return logging.LogRecord("app.test", logging.ERROR, __file__, 1, msg, args, exc)


def test_json_formatter_redacts_tracebacks():
    try:
        raise RuntimeError('upstream said {"password": "hunter2-xyz"}')
    except RuntimeError:
        exc = sys.exc_info()
    line = JsonFormatter().format(_record("failed for %s", "user_1", exc=exc))
    data = json.loads(line)
    assert data["level"] == "ERROR" and data["msg"] == "failed for user_1" and data["request_id"] == "-"
    assert "hunter2-xyz" not in line and "RuntimeError" in data["exc"]


def test_text_formatter_redacts_args():
    out = TextFormatter().format(_record("got %s", "password=hunter2-xyz"))
    assert "hunter2-xyz" not in out


def test_request_id_is_echoed_or_generated(client):
    r = client.get("/api/v2/health", headers={"X-Request-ID": "req-abcdef12"})
    assert r.headers["x-request-id"] == "req-abcdef12"
    r = client.get("/api/v2/health", headers={"X-Request-ID": "bad id\nwith newline"})
    assert r.headers["x-request-id"] != "bad id\nwith newline" and len(r.headers["x-request-id"]) == 16
    assert client.get("/api/v2/health").headers["x-request-id"]


def test_access_log_uses_route_templates_not_raw_paths(client, caplog):
    caplog.set_level(logging.INFO, logger="app.access")
    client.get("/api/v2/receipts/AAAAAAAAAAAAAAAA")
    client.get("/api/v2/password?length=33")
    lines = [r for r in caplog.records if r.name == "app.access"]
    text = " ".join(r.getMessage() for r in lines)
    assert "/api/v2/receipts/{receipt_id}" in text and "AAAAAAAAAAAAAAAA" not in text
    assert "length=33" not in text
    assert all(isinstance(r.http["duration_ms"], float) for r in lines)


def _db_dump() -> str:
    with db.engine().connect() as conn:
        return "\n".join(str(list(conn.execute(t.select()))) for t in SQLModel.metadata.sorted_tables)


def test_secrets_never_reach_logs_or_database(client, caplog):
    """Generate every kind of secret (with receipts) and a draw, then scan all log output and every table."""
    caplog.set_level(logging.DEBUG)
    pw = client.get("/api/v2/password?receipt=true").json()
    pp = client.get("/api/v2/passphrase?receipt=true").json()
    rnd = client.get("/api/v2/random?receipt=true&bytes=48").json()
    qp = client.get("/quantum-password").text
    secrets = [pw["password"], pw["receipt_salt"], pp["passphrase"], pp["receipt_salt"], rnd["hex"],
               rnd["receipt_salt"], qp.strip()]
    d = client.post("/api/v2/draws", json={"title": "t", "entries": ["a", "b", "c"], "winners": 1}).json()
    client.post(f"/api/v2/draws/{d['draw_id']}/run")

    logs = caplog.text + "\n".join(TextFormatter().format(r) for r in caplog.records)
    dump = _db_dump()
    for s in secrets:
        assert len(s) >= 8
        assert s not in logs, "secret found in logs"
        assert s not in dump, "secret found in the database"
