"""The standalone offline verifier agrees with the server, and runs without any QuantumPass code."""

import copy
import json
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.entropy.service import EntropyService
from app.main import create_app
from scripts import verify_receipt as v
from tests.conftest import FakeProvider

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "verify_receipt.py"
ENTRIES = ["Zoë", "alice", "  bob ", "Carol", "dave", "Émile", "frank", "grace"]


@pytest.fixture
def issued():
    with TestClient(create_app(settings=get_settings(), entropy=EntropyService([FakeProvider("lfd")]))) as c:
        keys = c.get("/.well-known/quantumpass-keys.json").json()
        pw = c.get("/api/v2/password?receipt=true").json()
        d = c.post("/api/v2/draws", json={"title": "Launch", "entries": ENTRIES, "winners": 3}).json()
        run = c.post(f"/api/v2/draws/{d['draw_id']}/run").json()
        yield {"keys": keys, "pw": pw, "commit": d["commit_receipt"], "run": run}


def test_password_receipt_with_commitment(issued):
    r = v.verify(issued["pw"]["receipt"], issued["keys"], issued["pw"]["password"], issued["pw"]["receipt_salt"])
    assert r["valid"], r["checks"]
    assert r["provenance"]["type"].startswith("operator-asserted") and r["quantum_evidence"].startswith("none")
    wrong = v.verify(issued["pw"]["receipt"], issued["keys"], "not-my-password", issued["pw"]["receipt_salt"])
    assert not wrong["valid"]


def test_draw_winners_recomputed_independently(issued):
    r = v.verify(v.unwrap(issued["run"])[0], issued["keys"], entries=list(reversed(ENTRIES)))
    assert r["valid"], r["checks"]
    assert any(c["check"].startswith("winners recomputed") and c["ok"] for c in r["checks"])
    assert v.verify(issued["commit"], issued["keys"], entries=ENTRIES)["valid"]


def test_wrong_entries_fail(issued):
    assert not v.verify(issued["run"]["receipt"], issued["keys"], entries=ENTRIES[:-1])["valid"]
    assert not v.verify(issued["run"]["receipt"], issued["keys"], entries=[*ENTRIES, "ALICE"])["valid"]  # duplicate


def test_tampered_receipts_fail(issued):
    r = copy.deepcopy(issued["run"]["receipt"])
    r["payload"]["result"]["winners"][0]["entry"] = "mallory"
    assert not v.verify(r, issued["keys"])["valid"]
    r = copy.deepcopy(issued["pw"]["receipt"])
    r["payload"]["evidence"]["quantum_evidence"] = "certified"
    assert not v.verify(r, issued["keys"])["valid"]
    r = copy.deepcopy(issued["pw"]["receipt"])
    r["signatures"]["ml-dsa-65"] = r["signatures"]["ed25519"]
    out = v.verify(r, issued["keys"])
    assert not out["valid"] and any(c["check"] == "Ed25519 signature" and c["ok"] for c in out["checks"])


def test_revoked_and_mislabelled_keys(issued):
    keys = copy.deepcopy(issued["keys"])
    keys["keys"][0].update(status="revoked", revoked_at=0)
    assert not v.verify(issued["pw"]["receipt"], keys)["valid"]
    keys = copy.deepcopy(issued["keys"])
    keys["keys"][0]["ed25519"] = keys["keys"][0]["ed25519"][::-1]
    out = v.verify(issued["pw"]["receipt"], keys)
    assert not out["valid"] and "mislabelled" in out["checks"][-1]["detail"]


def test_selection_algorithm_matches_server():
    import os

    from app.generator import select_winners

    for n, k in [(1, 1), (2, 1), (7, 7), (300, 5), (10_000, 50)]:
        seed = os.urandom(64)
        assert v.select_winners(seed, n, k) == select_winners(seed, [str(i) for i in range(n)], k)


def test_cli_runs_isolated_from_backend_code(issued, tmp_path):
    """`python -I` keeps the backend off sys.path: the script must work with only the cryptography package."""
    (tmp_path / "run.json").write_text(json.dumps(issued["run"]))
    (tmp_path / "keys.json").write_text(json.dumps(issued["keys"]))
    (tmp_path / "entries.json").write_text(json.dumps(ENTRIES))
    out = subprocess.run([sys.executable, "-I", str(SCRIPT), str(tmp_path / "run.json"), str(tmp_path / "keys.json"),
                          "--entries", str(tmp_path / "entries.json")], capture_output=True, text=True, cwd=tmp_path)
    assert out.returncode == 0, out.stdout + out.stderr
    assert "VALID" in out.stdout and "winners recomputed" in out.stdout
    bad = subprocess.run([sys.executable, "-I", str(SCRIPT), str(tmp_path / "run.json"), str(tmp_path / "keys.json"),
                          "--entries", str(tmp_path / "keys.json")], capture_output=True, text=True, cwd=tmp_path)
    assert bad.returncode == 2
