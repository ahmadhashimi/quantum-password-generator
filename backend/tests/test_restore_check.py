"""The restore checker passes on a healthy database and fails on a tampered one."""

import json

from fastapi.testclient import TestClient
from sqlalchemy import text

from app import db
from app.config import get_settings
from app.entropy.service import EntropyService
from app.main import create_app
from scripts import restore_check
from tests.conftest import FakeProvider


def test_restore_check(tmp_path, capsys):
    with TestClient(create_app(settings=get_settings(), entropy=EntropyService([FakeProvider("lfd")]))) as c:
        keys = c.get("/.well-known/quantumpass-keys.json").json()
        c.get("/api/v2/password?receipt=true")
        d = c.post("/api/v2/draws", json={"title": "t", "entries": ["a", "b"], "winners": 1}).json()
        c.post(f"/api/v2/draws/{d['draw_id']}/run")
    (tmp_path / "keys.json").write_text(json.dumps(keys))
    url = get_settings().database_url
    args = ["--database-url", url, "--keys", str(tmp_path / "keys.json"), "--source-url", url]
    assert restore_check.main(args) == 0
    report = json.loads(capsys.readouterr().out)
    assert report["ok"] and report["receipts"]["verified"] == report["receipts"]["total"] == 3

    if db.is_postgres():
        return  # the append-only trigger blocks the tampering below
    with db.engine().begin() as conn:
        conn.execute(text("UPDATE audit_events SET actor = 'mallory' WHERE seq = 2"))
        conn.execute(text("UPDATE receipts SET payload = replace(payload, :a, :b)"),
                     {"a": '"winners":1', "b": '"winners":2'})
    assert restore_check.main(args) == 1
    report = json.loads(capsys.readouterr().out)
    assert not report["audit_chain"]["ok"] and report["receipts"]["failed"]
